# EM-TaskFlow Frontend

The frontend for EM TaskFlow, built with **React** and **Create React App**. It provides a modern, responsive interface for interacting with the AI agents, managing tasks, and processing documents.

## 🚀 Features

- **AI Chat Interface**: Real-time chat with the Supervisor Agent.
- **Document Management**: PDF upload and processing for RAG context.
- **Task Visualization**: View tasks fetched from Jira/Notion.
- **PWA Support**: Installable as a Progressive Web App.
- **Responsive Design**: Optimized for desktop and mobile.

## 🛠️ Setup & Installation

### Prerequisites
- Node.js 20.x
- npm or pnpm

### Installation
```bash
cd frontend
npm install
```

### Configuration
The frontend proxies API requests to the backend. Update `package.json` if your backend runs on a different port:
```json
"proxy": "http://localhost:4000"
```

### Running the App
```bash
# Start development server
npm start

# Build for production
npm run build
```

## 🏗️ Project Structure

```
src/
├── components/
│   ├── Chat.js        # Main chat interface
│   ├── PDFUpload.js   # Document upload component
│   ├── TaskList.js    # Task visualization
│   └── Summary.js     # Summary display
├── App.js             # Main application layout
└── index.js           # Entry point
```

## 🧪 Testing

```bash
# Run test suite
npm test
```

## 📄 License
ISC License
