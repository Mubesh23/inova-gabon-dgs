const nodemailer = require('nodemailer');
const pdf = require('html-pdf');
const mongoose = require('mongoose');
const Model = mongoose.model('Invoice');
const { SendInvoice } = require('@/emailTemplate/SendEmailTemplate');

const sendMail = async (req, res) => {
  try {
    // Log the incoming request for debugging
    console.log('Request URL:', req.url);
    console.log('Request Body:', req.body);

    // Retrieve the invoice ID from the request body (since the route is /invoice/mail)
    const invoiceId = req.body.id;
    if (!invoiceId) {
      console.error('Invoice ID is missing from the request body.');
      return res.status(400).json({
        success: false,
        message: 'Invoice ID is required in the request body as "invoiceId".',
      });
    }

    console.log('Searching for invoice with ID:', invoiceId);

    const invoice = await Model.findOne({
      _id: invoiceId,
      removed: false,
    })
      .populate('createdBy', 'name')
      .exec();
    console.log('Invoice found:', invoice);

    if (!invoice) {
      return res.status(404).json({
        success: false,
        result: null,
        message: 'Invoice not found in database',
      });
    }

    // Create a test Ethereal account (for development/testing purposes)
    const testAccount = await nodemailer.createTestAccount();

    // Create a transporter using Ethereal's SMTP settings
    const transporter = nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });

    // Destructure additional email fields from request body and provide defaults if missing
    const { to, subject, name } = req.body;
    const emailTo = to || 'tizi.lion@gmail.com';
    const emailSubject = subject || `Invoice #${invoice.number}`;
    const emailName = name || (invoice.client || (invoice.createdBy && invoice.createdBy.name) || 'Valued Customer');

    if (!to || !subject || !name) {
      console.warn('Some required email fields are missing; default values will be used.');
    }

    // Generate the invoice HTML content using the SendInvoice template and invoice data
    const time = invoice.date || new Date();
    const htmlContent = SendInvoice({ title: emailSubject, name: emailName, time });

    // Define PDF generation options
    const pdfOptions = { format: 'Letter' };

    // Generate PDF from the HTML content and attach it to the email
    pdf.create(htmlContent, pdfOptions).toBuffer(async (err, buffer) => {
      if (err) {
        console.error('Error generating PDF:', err);
        return res.status(500).json({
          success: false,
          message: 'Error generating invoice PDF',
          error: err.message,
        });
      }

      // Setup email options with the PDF attachment
      const mailOptions = {
        from: process.env.EMAIL_FROM || 'default@example.com',
        to: emailTo,
        subject: emailSubject,
        html: htmlContent,
        attachments: [
          {
            filename: 'invoice.pdf',
            content: buffer,
            contentType: 'application/pdf',
          },
        ],
      };

      // Send the email using the transporter
      try {
        const info = await transporter.sendMail(mailOptions);
        console.log("Message sent: %s", info.messageId);
        const previewUrl = nodemailer.getTestMessageUrl(info);
        console.log("Preview URL: %s", previewUrl);
        return res.status(200).json({
          success: true,
          result: info,
          previewUrl,
          message: 'Invoice email sent successfully with PDF attachment',
        });
      } catch (error) {
        console.error('Error sending invoice email:', error);
        return res.status(500).json({
          success: false,
          message: 'Error sending invoice email',
          error: error.message,
        });
      }
    });
  } catch (error) {
    console.error('Error in sendMail:', error);
    return res.status(500).json({
      success: false,
      message: 'Error processing sendMail request',
      error: error.message,
    });
  }
};

module.exports = sendMail;
