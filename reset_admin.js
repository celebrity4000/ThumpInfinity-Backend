const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGODB_URI = "mongodb+srv://sonaliasrtech_db_user:8gMz4R03PNcQWoQy@cluster0.ykoholq.mongodb.net/?appName=Cluster0";

// Define Admin Schema locally
const adminSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }
});

adminSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

const Admin = mongoose.model('Admin', adminSchema);

async function run() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGODB_URI);
    console.log("Connected!");

    // Set the email and desired password
    const email = "tester@gamil.com";
    const newPassword = "tester123";

    let admin = await Admin.findOne({ email: email.toLowerCase() });
    if (admin) {
      console.log(`Found admin user: ${email}. Resetting password...`);
      admin.password = newPassword;
      await admin.save();
      console.log(`Password reset successfully to: ${newPassword}`);
    } else {
      console.log(`Admin user ${email} not found. Creating new admin...`);
      admin = new Admin({ email, password: newPassword });
      await admin.save();
      console.log(`Admin created successfully! Email: ${email}, Password: ${newPassword}`);
    }
  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected.");
  }
}

run();
