import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Navigate, useNavigate } from 'react-router-dom';
import { PERSON_NAME } from './constants';
import CONFIG from './config';


// Configure axios to include credentials (cookies) with all requests
axios.defaults.withCredentials = true;

function AdminPage() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [messageType, setMessageType] = useState('');
  const [customDate, setCustomDate] = useState('');
  const [customTime, setCustomTime] = useState('');
  const [showCustomTime, setShowCustomTime] = useState(false);
  const [recentMeals, setRecentMeals] = useState([]);
  const [loadingMeals, setLoadingMeals] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    mealId: null,
    mealInfo: null
  });

  const [authenticated, setAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [userData, setUserData] = useState(null);
  const navigate = useNavigate();


  // Fetch recent meals
  const fetchRecentMeals = async () => {
    try {
      setLoadingMeals(true);
      const response = await axios.get(`${CONFIG.apiUrl}/meals/recent?limit=5`);

      if (response.data.success) {
        setRecentMeals(response.data.meals);
      } else {
        console.error('Failed to fetch recent meals:', response.data.error);
      }
    } catch (err) {
      console.error('Error fetching recent meals:', err);
    } finally {
      setLoadingMeals(false);
    }
  };

  // Open confirmation dialog with meal info
  const openConfirmDialog = (mealId, e) => {
    e.preventDefault(); // Prevent any default behavior
    const selectedMeal = recentMeals.find(meal => meal.id === mealId);
    setConfirmDialog({
      isOpen: true,
      mealId,
      mealInfo: selectedMeal
    });
  };

  // Close dialog without deleting
  const closeConfirmDialog = () => {
    setConfirmDialog({ isOpen: false, mealId: null, mealInfo: null });
  };


  // Delete a meal log
  const deleteMeal = async (mealId) => {
    try {
      setDeleteLoading(mealId);
      closeConfirmDialog();

      const response = await axios.delete(`${CONFIG.apiUrl}/meals/${mealId}`);

      if (response.data.success) {
        // Refresh the meal list
        fetchRecentMeals();
        setMessage(`Meal log deleted successfully`);
        setMessageType('success');
      } else {
        setMessage(`Failed to delete meal log: ${response.data.error}`);
        setMessageType('error');
      }
    } catch (err) {
      setMessage('Failed to delete meal log');
      setMessageType('error');
      console.error('Error deleting meal:', err);
    } finally {
      setDeleteLoading(null);

      // Auto-clear success message after 3 seconds
      setTimeout(() => {
        if (messageType === 'success') {
          setMessage(null);
        }
      }, 3000);
    }
  };

  // Check authentication status on component mount
  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const response = await axios.get(`${CONFIG.apiUrl}/auth/status`);
        setAuthenticated(response.data.authenticated);
        if (response.data.authenticated) {
          setUserData({
            email: response.data.email,
            name: response.data.name
          });
		  fetchRecentMeals();
        }
      } catch (error) {
        console.error('Error checking authentication status:', error);
        setAuthenticated(false);
      } finally {
        setCheckingAuth(false);
      }
   };

    checkAuthStatus();
  }, []);

  const handleLogin = async () => {
    try {
      const response = await axios.get(`${CONFIG.apiUrl}/auth/login`);
      // Redirect the user to Google's OAuth page
      window.location.href = response.data.redirect_url;
    } catch (error) {
      console.error('Login error:', error);
      setMessage('Failed to initialize login');
      setMessageType('error');
    }
  };

  const handleLogout = async () => {
    try {
      await axios.post(`${CONFIG.apiUrl}/auth/logout`);
      setAuthenticated(false);
      setUserData(null);
      navigate('/');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // Set default values to current date and time when opening custom time form
  const handleShowCustomTime = () => {
    const now = new Date();
    const dateString = now.toISOString().split('T')[0]; // Format: YYYY-MM-DD
    const timeString = now.toTimeString().split(' ')[0].substring(0, 5); // Format: HH:MM

    setCustomDate(dateString);
    setCustomTime(timeString);
    setShowCustomTime(true);
  };

  const logMeal = async (ate, useCustomTime = false) => {
    try {
      setLoading(true);

      let payload = { ate };

      // If using custom time, add it to the payload
      if (useCustomTime && customDate && customTime) {
        const localDate = new Date(`${customDate}T${customTime}:00`);
		const utcTimestamp = localDate.toISOString();

		console.log('Original input:', `${customDate}T${customTime}:00`);
		console.log('Converted to UTC:', utcTimestamp);

		payload.timestamp = utcTimestamp;
      }

      const response = await axios.post(`${CONFIG.apiUrl}/meals`, payload);

      // Format the timestamp for display
      const timestampDisplay = new Date(response.data.timestamp).toLocaleString();

      setMessage(ate
        ? `Meal logged successfully for ${PERSON_NAME} at ${timestampDisplay}!`
        : `No meal logged successfully for ${PERSON_NAME} at ${timestampDisplay}!`
      );
      setMessageType('success');

      // Reset custom time form
      if (useCustomTime) {
        setShowCustomTime(false);
      }

      setTimeout(() => {
        setMessage(null);
      }, 3000);
    } catch (err) {
      setMessage('Failed to log meal status');
      setMessageType('error');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Show loading state while checking authentication
  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center">
        <div className="text-2xl">Checking authentication...</div>
      </div>
    );
  }

  // If not authenticated, show login page
  if (!authenticated) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-center text-gray-800 mb-6">Admin Login Required</h1>
          <p className="text-gray-600 mb-6 text-center">
            Please log in with your Google account to access the admin page.
          </p>
          <div className="flex justify-center">
            <button
              onClick={handleLogin}
              className="flex items-center px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors shadow-md"
            >
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
                <path fill="none" d="M1 1h22v22H1z" />
              </svg>
              Login with Google
            </button>
          </div>

          <div className="mt-8 text-center">
            <a
              href="/"
              className="text-blue-500 hover:text-blue-700 underline"
            >
              Back to Main Page
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Main admin page when authenticated
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
      <h1 className="text-3xl font-bold text-center text-gray-800 mb-2">Meal Tracker Admin</h1>

      {/* User info */}
      <div className="mb-6 flex items-center justify-center">
        <div className="bg-white px-4 py-2 rounded-lg shadow flex items-center">
          <span className="text-sm text-gray-600 mr-2">Logged in as:</span>
          <span className="font-medium">{userData?.name} ({userData?.email})</span>
          <button
            onClick={handleLogout}
            className="ml-4 text-sm text-red-500 hover:text-red-700"
          >
            Logout
          </button>
        </div>
      </div>


      <div className="flex flex-col space-y-4 w-full max-w-lg">
        {!showCustomTime ? (
          <>
            <button
              onClick={() => logMeal(true)}
              disabled={loading}
              className="py-3 px-4 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors shadow-md disabled:opacity-50"
            >
              {loading ? 'Logging...' : `${PERSON_NAME} Ate a Meal (Now)`}
            </button>

            <button
              onClick={() => logMeal(false)}
              disabled={loading}
              className="py-3 px-4 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors shadow-md disabled:opacity-50"
            >
              {loading ? 'Logging...' : `${PERSON_NAME} Did Not Eat (Now)`}
            </button>

            <button
              onClick={handleShowCustomTime}
              disabled={loading}
              className="py-3 px-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors shadow-md disabled:opacity-50"
            >
              Log Meal with Custom Time
            </button>
          </>
        ) : (
          <div className="bg-white p-4 rounded-lg shadow-md">
            <h2 className="text-lg font-semibold mb-4">Log Meal with Custom Time</h2>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
                <input
                  type="time"
                  value={customTime}
                  onChange={(e) => setCustomTime(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>

              <div className="flex space-x-3 pt-2">
                <button
                  onClick={() => logMeal(true, true)}
                  disabled={loading || !customDate || !customTime}
                  className="flex-1 py-2 px-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors shadow-md disabled:opacity-50"
                >
                  {loading ? 'Logging...' : `Ate`}
                </button>

                <button
                  onClick={() => logMeal(false, true)}
                  disabled={loading || !customDate || !customTime}
                  className="flex-1 py-2 px-3 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors shadow-md disabled:opacity-50"
                >
                  {loading ? 'Logging...' : `Did Not Eat`}
                </button>
              </div>

              <button
                onClick={() => setShowCustomTime(false)}
                className="w-full py-2 px-3 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {message && (
          <div className={`mt-4 p-3 rounded text-center ${
            messageType === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}>
            {message}
          </div>
        )}
      </div>

      {/* Recent Meals Section */}
      <div className="mt-8 w-full max-w-lg">
        <h2 className="text-xl font-bold text-gray-800 mb-3">Recent Meal Logs</h2>

        {loadingMeals ? (
          <div className="text-center py-4">
            <p className="text-gray-600">Loading meal logs...</p>
          </div>
        ) : recentMeals.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-4 text-center text-gray-600">
            No meal logs found.
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Time
                  </th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {recentMeals.map((meal) => (
                  <tr key={meal.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {meal.ate ? (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                          Ate
                        </span>
                      ) : (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                          Did Not Eat
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {meal.timestamp}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={(e) => openConfirmDialog(meal.id, e)}
                        disabled={deleteLoading === meal.id}
                        className="text-red-600 hover:text-red-900"
                      >
                        {deleteLoading === meal.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {/* Confirmation Dialog */}
      {confirmDialog.isOpen && confirmDialog.mealInfo && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="mb-6">
              <h3 className="text-lg font-medium text-gray-900 mb-2">Confirm Deletion</h3>

              <div className="bg-gray-50 p-4 rounded-md mb-4">
                <div className="flex items-center mb-2">
                  <span className="font-medium text-gray-700 mr-2">Status:</span>
                  {confirmDialog.mealInfo.ate ? (
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                      Ate
                    </span>
                  ) : (
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                      Did Not Eat
                    </span>
                  )}
                </div>
                <div className="flex items-center">
                  <span className="font-medium text-gray-700 mr-2">Time:</span>
                  <span className="text-sm text-gray-600">{confirmDialog.mealInfo.timestamp}</span>
                </div>
              </div>

              <p className="text-sm text-gray-500">
                Are you sure you want to delete this meal record? This action cannot be undone.
              </p>
            </div>
            <div className="flex justify-end space-x-3">
              <button
                onClick={closeConfirmDialog}
                className="bg-gray-100 text-gray-700 hover:bg-gray-200 px-4 py-2 rounded-md font-medium text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMeal(confirmDialog.mealId)}
                className="bg-red-500 text-white hover:bg-red-600 px-4 py-2 rounded-md font-medium text-sm"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 text-center">
        <a
          href="/"
          className="text-blue-500 hover:text-blue-700 underline"
        >
          Back to Main Page
        </a>
      </div>
    </div>
  );
}

export default AdminPage;
