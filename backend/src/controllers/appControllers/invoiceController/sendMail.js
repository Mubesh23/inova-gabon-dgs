const nodemailer = require('nodemailer');
const pdf = require('html-pdf');
const mongoose = require('mongoose');
const Model = mongoose.model('Invoice');
const { SendInvoice } = require('@/emailTemplate/SendEmailTemplate');

const mail = async (req, res) => {
  try {
    const invoiceId = req.body.id;
    if (!invoiceId) {
      return res.status(400).json({
        success: false,
        message: 'Invoice ID is required in the request body as "invoiceId".',
      });
    }

    const invoice = await Model.findOne({
      _id: invoiceId,
      removed: false,
    })
      .populate('createdBy', 'name')
      .exec();

    if (!invoice) {
      return res.status(404).json({
        success: false,
        result: null,
        message: 'Invoice not found in database',
      });
    }

    const testAccount = await nodemailer.createTestAccount();
    const transporter = nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });

    const { to, subject, name } = req.body;
    const emailTo = to || 'tizi.lion@gmail.com ';
    const emailSubject = subject || `Invoice #${invoice.number}`;
    const emailName = name || (invoice.client || (invoice.createdBy && invoice.createdBy.name) || 'Valued Customer');

    const time = invoice.date || new Date();
    const htmlContent = SendInvoice({ title: emailSubject, name: emailName, time });
    const pdfOptions = { format: 'Letter' };

    pdf.create(htmlContent, pdfOptions).toBuffer(async (err, buffer) => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: 'Error generating invoice PDF',
          error: err.message,
        });
      }

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

      try {
        const info = await transporter.mail(mailOptions);
        return res.status(200).json({
          success: true,
          result: info,
          previewUrl: nodemailer.getTestMessageUrl(info),
          message: 'Invoice email sent successfully with PDF attachment',
        });
      } catch (error) {
        return res.status(500).json({
          success: false,
          message: 'Error sending invoice email',
          error: error.message,
        });
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error processing mail request',
      error: error.message,
    });
  }
};

module.exports = mail;
