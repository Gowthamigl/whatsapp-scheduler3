const express = require('express');
const fileUpload = require('express-fileupload');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const path = require('path');
const bodyParser = require('body-parser');
const schedule = require('node-schedule');

const app = express();
const PORT = process.env.PORT || 5000;

// WhatsApp Client
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: path.join(__dirname, '.wwebjs_auth') }),
  puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] },
});

client.on('qr', qr => {
  console.log('📱 Scan this QR code in your WhatsApp:');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => console.log('✅ WhatsApp client is ready.'));
client.initialize();

// Middleware
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(fileUpload());

// Routes
app.get('/', async (req, res) => {
  try {
    const chats = await client.getChats();
    const groups = chats.filter(c => c.isGroup).map(g => ({ id: g.id._serialized, name: g.name }));
    res.render('indexsearch', { groups, success: null, error: null });
  } catch (e) {
    res.render('indexsearch', { groups: [], success: null, error: '❌ WhatsApp not connected. Please scan QR.' });
  }
});

app.post('/send', async (req, res) => {
  const groupIds = req.body.groupIds;
  const message = req.body.message;
  const imageFile = req.files ? req.files.image : null;
  const scheduleTime = req.body.scheduleTime;

  if (!groupIds) return res.send('⚠️ Please select at least one group.');
  if (!message && !imageFile) return res.send('⚠️ Please enter a message or select an image.');

  const selectedGroups = Array.isArray(groupIds) ? groupIds : [groupIds];
  let media = null;

  if (imageFile) {
    media = new MessageMedia(imageFile.mimetype, imageFile.data.toString('base64'), imageFile.name);
  }

  const sendMessages = async () => {
    for (const groupId of selectedGroups) {
      try {
        const chat = await client.getChatById(groupId);
        if (media) await chat.sendMessage(media, { caption: message });
        else await chat.sendMessage(message);
        console.log(`✅ Sent to group: ${chat.name}`);
      } catch (err) {
        console.error(`❌ Failed to send to ${groupId}: ${err.message}`);
      }
    }
  };

  if (scheduleTime) {
    const date = new Date(scheduleTime);
    schedule.scheduleJob(date, async () => {
      await sendMessages();
      console.log('✅ Scheduled message sent successfully!');
    });
    res.render('indexsearch', { groups: [], success: '🕒 Message scheduled successfully!', error: null });
  } else {
    await sendMessages();
    res.render('indexsearch', { groups: [], success: '✅ Message sent successfully!', error: null });
  }
});

// Render uses process.env.PORT
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
