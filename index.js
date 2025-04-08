import dotenv from 'dotenv';
import connectDB from './db/index.js';
import { app, server } from './socket/index.js';

dotenv.config();

connectDB()
  .then(() => {
    app.on('error', (error) => {
      console.log('The server connection error:', error);
      throw error;
    });

    const port = process.env.PORT || 3000;
    server.listen(port, () => {
      console.log(`The server is running on port: ${port}`);
    });
  })
  .catch((error) => {
    console.log('MongoDB connection failed:', error);
  });

// Handle unhandled promise rejections
process.on('unhandledRejection', (error) => {
  console.log('Unhandled Rejection at:', error.stack || error);
  server.close(() => {
    process.exit(1);
  });
});
