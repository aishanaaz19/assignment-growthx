import 'dotenv/config'
import express from "express";
import bodyParser from "body-parser";
import mongoose from "mongoose";
import bcrypt from 'bcrypt';
import session from 'express-session';
import axios from "axios";
import path from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { log } from 'node:console';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const port = 3000;

//express config
app.set('view engine', 'ejs'); 
app.set('views', __dirname + '/views');  
app.use(express.static(path.join(__dirname, 'public')));

//connecting to database
mongoose.connect(`${process.env.MONGODB_URI}`)
.then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('Error connecting to MongoDB:', err));

// Middleware for parsing 
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Session middleware configuaration
app.use(session({
  secret: process.env.SESSION_SECRET, 
  resave: false,                      
  saveUninitialized: false,           
  cookie: {
      secure: process.env.NODE_ENV === 'production', 
      httpOnly: true,   
  }
}));

// User schema
const userSchema = new mongoose.Schema({
  username: String,
  password: String,
  fullname: String,
  email: String
});
userSchema.pre('save', async function (next) {
  const user = this;
  if (user.isModified('password')) {
    user.password = await bcrypt.hash(user.password, 10);
  }
  next();
});
const User = mongoose.model('User', userSchema);

// Admin schema
const adminSchema = new mongoose.Schema({
  username: String,
  password: String,
  fullname: String,
  email: String
});
adminSchema.pre('save', async function (next) {
  const admin = this;
  if (admin.isModified('password')) {
    admin.password = await bcrypt.hash(admin.password, 10);
  }
  next();
});
const Admin = mongoose.model('Admin', adminSchema);

//Assignment schema
const assignmentSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  task: { type: String, required: true },
  admin: { type: String, required: true },
  status: { type: String, enum: ['Pending', 'Accepted', 'Rejected'], default: 'Pending' },
  timestamp: { type: Date, default: Date.now },
});

const Assignment = mongoose.model('Assignment', assignmentSchema);

// isUserLogin
const isUserLogin = (req, res, next) => {
  if (!req?.session?.user){
    return res.redirect('/user/login');
  }
  next();
};
// isAdminLogin
const isAdminLogin = (req, res, next) => {
  if (!req?.session?.admin){
    return res.redirect('/admin/login');
  }
  next();
};

// testing
app.get('/', async(req, res) => {
  if (!req?.session?.user){
    res.render('index.ejs',{log: 0})
  }
  else{
    res.render('/user/profile', {user: req.session.user, log: 1})
    res.render('/admin/profile', {admin: req.session.admin, log: 1})
  }
})

//If user logged in
app.get('/user/profile', isUserLogin, async(req, res) => {
  res.render('user/profile', {user: req.session.user, log: 1})
})

//If admin logged in
app.get('/admin/profile', isAdminLogin, async(req, res) => {
  res.render('admin/profile', {admin: req.session.admin, log: 1})
})

//GET routes for user

// User Login
app.get('/user/login', async(req,res) => {
  res.render('user/login.ejs', {log: 0})
})

// User register
app.get('/user/register', async(req,res) => {
  res.render('user/register.ejs', {log: 0})
})

// User dashboard
app.get('/user/profile', async(req, res) => {
  res.render('user/profile.ejs', { user: req.session.user , log: 1})
})

//Upload assignment
app.get('/upload', async(req, res) => {
try{
  const admins = await Admin.find({}, 'fullname');
  const adminNames = admins.map(admin => admin.fullname);
  res.render('user/upload.ejs', { 
    user: req.session.user , 
    log: 1,
    admins: adminNames
  })
  } catch (error) {
    console.error('Error fetching admins:', error);
    res.status(500).send('Internal Server Error');
  }  
})

// POST routes for user

// register
app.post('/user/register', async (req, res) => {
  try {
    const user = new User(req.body);
    await user.save();
    req.session.user = user;
    res.redirect('/user/login');
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ message: 'Error creating user' });
  }
});

// login
app.post('/user/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    req.session.user = user;
    res.redirect('/user/profile');
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

//Upload assignment (User)
app.post('/upload', isUserLogin, async (req, res) => {
  const { userId, task, admin } = req.body;
  if (!userId || !task || !admin) {
    return res.status(400).json({ message: 'Missing required fields.' });
  }
  try {
      const assignment = new Assignment({ userId, task, admin });
      await assignment.save();
      res.status(201).json({ message: 'Assignment submitted successfully', assignment });
  } catch (err) {
      res.status(500).json({ message: 'Internal server error', error: err.message });
  }
});

// logout
app.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Error destroying session:', err);
    }
    res.redirect('/'); 
  });
});

// GET routes for admin

// Admin Login
app.get('/admin/login', async(req,res) => {
  res.render('admin/login.ejs')
})

// Admin register
app.get('/admin/register', async(req,res) => {
  res.render('admin/register.ejs')
})
// Admin profile
app.get('/admin/profile/:adminName', async (req, res) => {
  try {
      const { adminName } = req.params; // Get adminName from URL
      const admin = await Admin.findOne({ username: adminName }); // Query admin data from database

      if (!admin) {
          return res.status(404).send('Admin not found');
      }

      res.render('admin/profile.ejs', { admin }); // Render admin profile page
  } catch (error) {
      console.error('Error fetching admin profile:', error);
      res.status(500).send('Internal Server Error');
  }
});
// Fetch assignments
app.get('/admin/assignments/:adminName', async (req, res) => {
  const { adminName } = req.params;
 try{
  // Fetch assignments tagged to this admin
  console.log('Admin Name:', adminName);
  const assignments = await Assignment.find({ admin: adminName });
  console.log("Fetched assignments:", assignments);
  res.render('admin/assignments.ejs', { adminName, assignments });
 } catch (error) {
  console.error('Error fetching assignments:', error);
  res.status(500).send('Internal Server Error');
 }
  
  
  
});

// // Handle assignment acceptance/rejection
// app.post('/assignments/:id/accept', async (req, res) => {
//   const { assignmentId, status } = req.body;

//   // Update the status of the assignment
//   await Assignment.findByIdAndUpdate(assignmentId, { status });

//   res.send('Assignment updated successfully!');
// });
// Accept assignment
app.post('/assignments/:id/accept', async (req, res) => {
  const { id } = req.params; // Get the assignment ID from the route parameter

  try {
    const assignment = await Assignment.findById(id);
    if (assignment) {
      assignment.status = 'Accepted';
      await assignment.save(); 
      res.redirect(`/assignments/${id}/status?status=accepted`);
    } else {
      res.status(404).send('Assignment not found');
    }
  } catch (error) {
    console.error('Error accepting assignment:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Reject assignment
app.post('/assignments/:id/reject', async (req, res) => {
  const { id } = req.params;

  try {
    const assignment = await Assignment.findById(id);
    if (assignment) {
      assignment.status = 'Rejected';
      await assignment.save(); 
      res.redirect(`/assignments/${id}/status?status=rejected`);
    } else {
      res.status(404).send('Assignment not found');
    }
  } catch (error) {
    console.error('Error rejecting assignment:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Status route to show acceptance/rejection status
app.get('/assignments/:id/status', async (req, res) => {
  const { id } = req.params;
  const status = req.query.status; // Get the 'status' query parameter (accepted or rejected)

  try {
    const assignment = await Assignment.findById(id);
    if (assignment) {
      res.render('assignmentStatus', { assignment, status });
    } else {
      res.status(404).send('Assignment not found');
    }
  } catch (error) {
    console.error('Error fetching assignment:', error);
    res.status(500).send('Internal Server Error');
  }
});


// // Get Tagged assignments
// app.get('/admin/assignments/:adminName', async (req, res) => {
//   try {
//       const { adminName } = req.params; // Extract from route parameter
//       const assignments = await Assignment.find({ adminName });
//       res.render('admin/assignments', { adminName, assignments });
//   } catch (error) {
//       console.error('Error fetching assignments:', error);
//       res.status(500).send('Internal Server Error');
//   }
// });

// POST routes for admin

// register
app.post('/admin/register', async (req, res) => {
  try {
    const admin = new Admin(req.body);
    await admin.save();
    req.session.admin = admin;
    res.redirect('/admin/login');
  } catch (error) {
    console.error('Error creating admin:', error);
    res.status(500).json({ message: 'Error creating admin' });
  }
});

// login
app.post('/admin/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const admin = await Admin.findOne({ username });
    if (!admin) {
      return res.status(401).json({ message: 'Admin not found' });
    }
    const passwordMatch = await bcrypt.compare(password, admin.password);
    if (!passwordMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    req.session.admin = admin;
    res.redirect(`/admin/profile/${admin.username}`);
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});
//Review assignment
// app.post('/assignments/:id', async (req, res) => {
//   const { id } = req.params;
//   const { status } = req.body;

//   if (!['Accepted', 'Rejected'].includes(status)) {
//       return res.status(400).json({ message: 'Invalid status. Use Accepted or Rejected.' });
//   }

//   try {
//       const assignment = await Assignment.findByIdAndUpdate(
//           id,
//           { status },
//           { new: true }
//       );

//       if (!assignment) {
//           return res.status(404).json({ message: 'Assignment not found.' });
//       }

//       res.status(200).json({ message: 'Assignment status updated', assignment });
//   } catch (err) {
//       res.status(500).json({ message: 'Internal server error', error: err.message });
//   }
// });

// server start
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
