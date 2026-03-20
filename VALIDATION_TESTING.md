# Input Validation & Security Testing Guide

This document covers testing the P1-VALIDATE implementation (input validation, email domain checks, file upload validation).

## Test Suite: Email & Password Validation

### 1. Valid Signup

```bash
curl -X POST http://localhost:8080/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123",
    "firstName": "John"
  }'
```

**Expected:** 201 Created, returns JWT token

---

### 2. Missing Email

```bash
curl -X POST http://localhost:8080/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "password": "SecurePass123"
  }'
```

**Expected:** 400 Bad Request
```json
{
  "error": "Validation failed",
  "details": ["\"email\" is required"]
}
```

---

### 3. Invalid Email Format

```bash
curl -X POST http://localhost:8080/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "not-an-email",
    "password": "SecurePass123"
  }'
```

**Expected:** 400 Bad Request
```json
{
  "error": "Validation failed",
  "details": ["\"email\" must be a valid email"]
}
```

---

### 4. Password Too Short

```bash
curl -X POST http://localhost:8080/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "short"
  }'
```

**Expected:** 400 Bad Request
```json
{
  "error": "Validation failed",
  "details": ["\"password\" length must be at least 8 characters long"]
}
```

---

### 5. Invalid Email Domain (Blocked)

```bash
curl -X POST http://localhost:8080/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@test.com",
    "password": "SecurePass123"
  }'
```

**Expected:** 400 Bad Request
```json
{
  "error": "Please use a valid email address"
}
```

**Note:** test.com, example.com, localhost, invalid.com are blocked to prevent fake accounts.

---

### 6. Email Already Registered

```bash
# First signup (succeeds)
curl -X POST http://localhost:8080/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "duplicate@gmail.com",
    "password": "SecurePass123"
  }'

# Second signup with same email (fails)
curl -X POST http://localhost:8080/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "duplicate@gmail.com",
    "password": "DifferentPass123"
  }'
```

**Expected (second request):** 409 Conflict
```json
{
  "error": "Email already registered"
}
```

---

## Test Suite: Login Validation

### 1. Valid Login

```bash
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123"
  }'
```

**Expected:** 200 OK, returns JWT token

---

### 2. Missing Email

```bash
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "password": "SecurePass123"
  }'
```

**Expected:** 400 Bad Request
```json
{
  "error": "Validation failed",
  "details": ["\"email\" is required"]
}
```

---

### 3. Invalid Email Format

```bash
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "not-an-email",
    "password": "password"
  }'
```

**Expected:** 400 Bad Request
```json
{
  "error": "Validation failed",
  "details": ["\"email\" must be a valid email"]
}
```

---

### 4. Wrong Password

```bash
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "WrongPassword"
  }'
```

**Expected:** 401 Unauthorized
```json
{
  "error": "Invalid email or password"
}
```

---

### 5. User Not Found

```bash
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "nonexistent@example.com",
    "password": "password"
  }'
```

**Expected:** 401 Unauthorized
```json
{
  "error": "Invalid email or password"
}
```

---

## Test Suite: Email Verification

### 1. Valid Email Verification

```bash
curl -X POST http://localhost:8080/api/auth/verify-email \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com"
  }'
```

**Expected:** 200 OK
```json
{
  "success": true,
  "message": "Email verified successfully",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "email_verified": true
  }
}
```

---

### 2. Invalid Email Format

```bash
curl -X POST http://localhost:8080/api/auth/verify-email \
  -H "Content-Type: application/json" \
  -d '{
    "email": "not-an-email"
  }'
```

**Expected:** 400 Bad Request
```json
{
  "error": "Validation failed",
  "details": ["\"email\" must be a valid email"]
}
```

---

### 3. User Not Found

```bash
curl -X POST http://localhost:8080/api/auth/verify-email \
  -H "Content-Type: application/json" \
  -d '{
    "email": "nonexistent@example.com"
  }'
```

**Expected:** 404 Not Found
```json
{
  "error": "User not found"
}
```

---

## Test Suite: XSS Prevention

### 1. HTML/Script Injection in Name Field

```bash
curl -X POST http://localhost:8080/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123",
    "firstName": "<script>alert(\"xss\")</script>"
  }'
```

**Expected:** 201 Created
- Joi automatically escapes HTML in string fields
- firstName stored as literal: `&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;`
- When rendered on frontend, script does NOT execute

---

### 2. SQL Injection Attempt in Email

```bash
curl -X POST http://localhost:8080/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "' OR '1'='1@example.com",
    "password": "SecurePass123"
  }'
```

**Expected:** 400 Bad Request
```json
{
  "error": "Validation failed",
  "details": ["\"email\" must be a valid email"]
}
```

**Note:** Invalid email format blocks before reaching DB queries. Parameterized queries (via pg module) prevent SQL injection anyway.

---

## Test Suite: File Upload Validation

### 1. Valid PDF Upload

```bash
curl -X POST http://localhost:8080/api/uploads \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@resume.pdf"
```

**Expected:** 200 OK (if authenticated)

---

### 2. Invalid File Type (EXE)

```bash
curl -X POST http://localhost:8080/api/uploads \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@malware.exe"
```

**Expected:** 400 Bad Request
```json
{
  "error": "Invalid file type. Only PDF, DOCX, and DOC files are supported.",
  "supported": ["PDF", "DOCX", "DOC"]
}
```

---

### 3. File Too Large (>50MB)

```bash
# Create 60MB dummy file
dd if=/dev/zero of=large.pdf bs=1M count=60

curl -X POST http://localhost:8080/api/uploads \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@large.pdf"
```

**Expected:** 400 Bad Request
```json
{
  "error": "File too large. Maximum size is 50MB.",
  "maxSize": "50MB",
  "providedSize": "60.00MB"
}
```

---

### 4. Path Traversal in Filename

```bash
# File named: ../../../etc/passwd.pdf
curl -X POST http://localhost:8080/api/uploads \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@../../../etc/passwd.pdf"
```

**Expected:** 200 OK (if valid PDF)
- Filename sanitized: `etc_passwd.pdf`
- Path traversal attempts removed
- Cannot escape upload directory

---

## Verification Checklist

- [x] Email validation rejects invalid formats
- [x] Email domain validation blocks fake domains (test.com, example.com)
- [x] Password minimum length enforced (8 chars)
- [x] HTML/script injection escaped by Joi
- [x] SQL injection prevented (invalid email format + parameterized queries)
- [x] File uploads reject non-resume types
- [x] File uploads enforce 50MB limit
- [x] Filenames sanitized (path traversal blocked)
- [x] Duplicate emails blocked
- [x] Error messages are user-friendly (no stack traces)
- [x] Validation happens before database queries

---

## Frontend Validation (React)

In the frontend, add client-side validation in SignupPage.jsx:

```javascript
import DOMPurify from 'dompurify';

function validateForm(values) {
  const errors = {};
  
  // Email validation
  if (!values.email) {
    errors.email = 'Email required';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
    errors.email = 'Invalid email address';
  }
  
  // Password validation
  if (!values.password) {
    errors.password = 'Password required';
  } else if (values.password.length < 8) {
    errors.password = 'Password must be at least 8 characters';
  }
  
  return errors;
}

// Sanitize any user-provided HTML before rendering
const safeHtml = DOMPurify.sanitize(userContent);
```

---

## Security Headers (Optional Enhancement)

Consider adding these headers to server.js:

```javascript
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});
```

---
