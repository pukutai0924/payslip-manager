const initializeGoogleApi = async () => {
  try {
    // Check if we're in development environment
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    if (isDevelopment) {
      console.warn('Running in development environment. Some Google API features may be limited.');
      // You might want to use a different client ID for development
      // or implement alternative authentication methods for local testing
      return;
    }

    // Production initialization code
    await window.gapi.client.init({
      clientId: process.env.REACT_APP_GOOGLE_CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/drive.file',
    });
  } catch (error) {
    console.error('Failed to initialize Google API:', error);
    // Handle the error gracefully without throwing
    return null;
  }
};

export { initializeGoogleApi };