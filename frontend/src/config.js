const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const CONFIG = {
  apiUrl: API_URL,
  appName: 'Public Meal Tracker',
};

console.log(CONFIG);

export default CONFIG;
