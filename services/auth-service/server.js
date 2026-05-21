require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Load Schema first in case Mongoose is active
require('./models/User');
require('./models/CompanyEmployee');

const { connectDB, UserModel, CompanyEmployeeModel } = require('./db');
const logAudit = require('./auditHelper');

const app = express();
const PORT = process.env.PORT || 5001;
const JWT_SECRET = process.env.JWT_SECRET || 'beaver_jwt_secret_key_99';

// Middlewares
app.use(cors());
app.use(express.json());

// Initialize Database
connectDB();

// Endpoints
// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, employeeId, password } = req.body;

    if (!name || !email || !employeeId || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Verify pre-authorized corporate employee registry
    const isPreAuthorized = await CompanyEmployeeModel.findOne({
      email: email.toLowerCase().trim(),
      employeeId: employeeId.toUpperCase().trim()
    });
    if (!isPreAuthorized) {
      return res.status(400).json({
        message: 'Your Employee ID and Email combination is not pre-registered in the company registry. Please contact HR.'
      });
    }

    // Check if user already exists
    const existingEmail = await UserModel.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    const existingEmp = await UserModel.findOne({ employeeId });
    if (existingEmp) {
      return res.status(400).json({ message: 'Employee ID already registered' });
    }

    // Hash Password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create User
    const newUser = await UserModel.create({
      name,
      email,
      employeeId,
      password: hashedPassword,
      role: 'Employee'
    });

    // Fire audit action
    logAudit(
      'GLOBAL',
      name,
      email,
      'Employee',
      'USER_REGISTER',
      `Registered user: ${name} (${employeeId})`,
      employeeId
    );

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        _id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        employeeId: newUser.employeeId,
        role: newUser.role
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await UserModel.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Verify employee still active in company registry
    const stillAuthorized = await CompanyEmployeeModel.findOne({
      email: user.email.toLowerCase().trim(),
      employeeId: user.employeeId.toUpperCase().trim()
    });
    if (!stillAuthorized) {
      return res.status(403).json({
        message: 'Access denied. Your employee status could not be verified in the company registry.'
      });
    }

    // Create Token
    const token = jwt.sign(
      { id: user._id, role: user.role, email: user.email, name: user.name, employeeId: user.employeeId },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Fire audit action
    logAudit(
      'GLOBAL',
      user.name,
      user.email,
      user.role,
      'USER_LOGIN',
      `User logged in: ${user.name}`,
      user.employeeId
    );

    res.json({
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        employeeId: user.employeeId,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Get profile from JWT token
app.get('/api/auth/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await UserModel.findById(decoded.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        employeeId: user.employeeId,
        role: user.role
      }
    });
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
});

// Get User Directory
app.get('/api/auth/users', async (req, res) => {
  try {
    const users = await UserModel.find({});
    // Strip passwords before returning
    const safeUsers = users.map(user => ({
      _id: user._id,
      name: user.name,
      email: user.email,
      employeeId: user.employeeId,
      role: user.role
    }));
    res.json(safeUsers);
  } catch (error) {
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Get single user by ID (Internal / Public lookup)
app.get('/api/auth/users/:id', async (req, res) => {
  try {
    const user = await UserModel.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      employeeId: user.employeeId,
      role: user.role
    });
  } catch (error) {
    console.error('Fetch user by ID error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 [Auth-Service] running on http://localhost:${PORT}`);
});
