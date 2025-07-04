const express = require('express');
const cors = require('cors');
const apiRouter = require('./routes/api');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.use('/api', apiRouter);

app.get('/', (req, res) => {
  res.send('EM TaskFlow API is running.');
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
