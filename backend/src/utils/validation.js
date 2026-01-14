export function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function isNotEmpty(value) {
  return value.trim().length > 0;
}

export function hasMinLength(value, minLength) {
  return value.length >= minLength;
}

export function hasMaxLength(value, maxLength) {
  return value.length <= maxLength;
}

export function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function isAlphanumeric(value) {
  const alphanumericRegex = /^[a-zA-Z0-9]+$/;
  return alphanumericRegex.test(value);
}

export function isInRange(value, min, max) {
  return value >= min && value <= max;
}

export function isValidJson(jsonString) {
  try {
    JSON.parse(jsonString);
    return true;
  } catch {
    return false;
  }
}

export function validateEmail(email) {
  return isValidEmail(email);
}

export function validatePassword(password) {
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/;
  return passwordRegex.test(password);
}

export function validateUrl(url) {
  return isValidUrl(url);
}

export function sanitizeString(input) {
  return input
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .trim();
}

export function validateRequiredFields(obj, requiredFields) {
  const missingFields = [];

  for (const field of requiredFields) {
    if (!obj[field] || (typeof obj[field] === 'string' && obj[field].trim() === '')) {
      missingFields.push(field);
    }
  }

  return {
    isValid: missingFields.length === 0,
    missingFields,
  };
}

