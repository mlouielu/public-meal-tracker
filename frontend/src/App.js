import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { formatDistanceToNow } from 'date-fns';
import { PERSON_NAME, PERSON_PRONOUN } from './constants';
import CONFIG from './config';

function App() {
  const [mealStatus, setMealStatus] = useState({
    ate: false,
    timestamp: null,
    last_meal_timestamp: null,
    status_changed: false,
    time_since_last_meal: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchMealStatus = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${CONFIG.apiUrl}/meals`);
      setMealStatus(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to fetch meal status');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const sendReminder = async () => {
    try {
      await axios.post(`${CONFIG.apiUrl}/remind`);
      alert('Reminder sent!');
    } catch (err) {
      setError('Failed to send reminder');
      console.error(err);
    }
  };

  useEffect(() => {
    fetchMealStatus();

    // Polling every minute to check for status updates
    // This will also handle the 3-hour automatic status change
    const intervalId = setInterval(fetchMealStatus, 60000);

    return () => clearInterval(intervalId);
  }, []);

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '';

    try {
      const date = new Date(timestamp);

      // Format the date with timezone (EDT/EST)
      const options = {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short'
      };

      // Full timestamp with timezone
      const fullTimestamp = date.toLocaleString('en-US', options);

      // Also add the relative time for context
      const relativeTime = formatDistanceToNow(date, { addSuffix: true });

      return `${fullTimestamp} (${relativeTime})`;
    } catch (err) {
      console.error('Date formatting error:', err);
      return timestamp;
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <h1 className="text-4xl font-extrabold leading-none tracking-tight text-gray-800 mb-6">{PERSON_NAME}'s Public Meal Tracker 🍲</h1>
		<p class="text-sm text-gray-500 mb-4">This is a public meal tracker for {PERSON_NAME}. {PERSON_PRONOUN} lost 5 kg (11 lbs) past month becasue {PERSON_PRONOUN} only eat one meal a day. {PERSON_NAME} needs your help!</p>

      {loading ? (
        <div className="text-center py-4">
          <p className="text-gray-600">Loading...</p>
        </div>
      ) : error ? (
        <div className="text-center py-4">
          <p className="text-red-600">{error}</p>
          <button
            onClick={fetchMealStatus}
            className="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition"
          >
            Try Again
          </button>
        </div>
      ) : (
        <div className="text-center py-8 w-full">
        {mealStatus.ate ? (
            <div className="flex flex-col h-full">
              {/* Expanded green background with white text */}
              <div className="bg-green-600 text-white py-10 mb-6 flex items-center justify-center rounded-lg shadow-md">
                <h2 className="text-3xl font-bold">{PERSON_NAME} has eaten!</h2>
              </div>
              <p className="text-gray-600">
                Last meal logged: {formatTimestamp(mealStatus.timestamp)}
              </p>
            </div>
          ) : (
            <div className="flex flex-col h-full">
              {/* Expanded red background with white text */}
              <div className="bg-red-600 text-white py-10 mb-6 flex items-center justify-center rounded-lg shadow-md">
                <h2 className="text-3xl font-bold">{PERSON_NAME} hasn't eaten yet!</h2>
              </div>

              {/* Show last meal time if status auto-expired */}
              {mealStatus.last_meal_timestamp && (
                <div className="mb-4">
                  <p className="text-gray-600">
                    {PERSON_NAME}'s last meal was more than 3 hours ago.<br></br>
					{formatTimestamp(mealStatus.last_meal_timestamp)}
                  </p>
                </div>
              )}

              <button
                onClick={sendReminder}
                className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors shadow-md"
              >
                Send Meal Reminder
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
