# Google Calendar Integration Credentials

## Setup Instructions

To enable Google Calendar integration, you need to create a service account credentials file.

### Option 1: Environment Variables (Recommended for Production)

Set the following environment variables:
```bash
export GCP_PROJECT_ID="your-project-id"
export GCP_PRIVATE_KEY_ID="your-private-key-id"  
export GCP_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
export GCP_CLIENT_EMAIL="your-service-account@your-project.iam.gserviceaccount.com"
export GCP_CLIENT_ID="your-client-id"
export GCP_CLIENT_EMAIL_ENCODED="your-service-account%40your-project.iam.gserviceaccount.com"
```

The system will automatically create the credentials file from these environment variables.

### Option 2: Manual File Creation (Development Only)

1. Copy the template: `cp gcp-oauth.keys.json.template gcp-oauth.keys.json`
2. Replace the placeholder values with your actual Google Cloud service account credentials
3. **NEVER commit this file to git** - it's already in .gitignore

### Getting Service Account Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project or create a new one
3. Navigate to "IAM & Admin" → "Service Accounts"
4. Create a new service account or select an existing one
5. Click "Create Key" → "JSON" 
6. Download the JSON file and use its contents

### Required APIs

Make sure these APIs are enabled in your Google Cloud project:
- Google Calendar API
- Google Drive API (if needed)

### Permissions

The service account needs:
- Calendar access permissions
- Appropriate scopes for your use case