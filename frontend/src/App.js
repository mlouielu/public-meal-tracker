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


  const [reminderMessage, setReminderMessage] = useState('');
  const [reminderSender, setReminderSender] = useState('');
  const [reminderSending, setReminderSending] = useState(false);
  const [showReminderInput, setShowReminderInput] = useState(true);

  const handleReminderClick = () => {
    setShowReminderInput(true);
  };

  const sendReminder = async () => {
    try {
      setReminderSending(true);
      const payload = { message: reminderMessage || "Time to eat!" };
      const response = await axios.post(`${CONFIG.apiUrl}/remind`, payload);

      setShowReminderInput(false);
      setReminderMessage('');

      // Log rate limit information
      const rateLimit = response.data.rate_limit;
      if (rateLimit) {
        console.log(`Rate limit: ${rateLimit.remaining}/${rateLimit.limit} requests remaining`);
        console.log(`Rate limit resets in ${Math.floor(rateLimit.reset / 60)} minutes and ${rateLimit.reset % 60} seconds`);
      }
    } catch (err) {
      if (err.response && err.response.status === 429) {
        // Rate limit exceeded
        const retryAfter = err.response.data.retry_after || 60;
        setError(`Reminder limit exceeded. Please try again in ${Math.floor(retryAfter / 60)} minutes and ${retryAfter % 60} seconds.`);
      } else {
        setError('Failed to send reminder');
      }
      console.error(err);
    } finally {
      setReminderSending(false);
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
      <h1 className="text-4xl font-extrabold leading-none tracking-tight text-gray-800 mb-4">{PERSON_NAME}'s Public Meal Tracker 🍲</h1>
		<p class="text-sm text-gray-500 mb-4">This is a public meal tracker for {PERSON_NAME}. {PERSON_PRONOUN} lost 5 kg (11 lbs) past month becasue {PERSON_PRONOUN} only eat one meal a day. {PERSON_NAME} needs your help!</p>

      {error ? (
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
        <div className="text-center py-4S w-full">
        {mealStatus.ate ? (
            <div className="flex flex-col h-full">
              {/* Expanded green background with white text */}
              <div className="bg-green-600 text-white py-10 flex flex-col items-center justify-center rounded-lg shadow-md">
                <h2 className="text-3xl font-bold">{PERSON_NAME} has eaten!</h2>
				<p className="text-white-600 mt-2 ml-2 mr-2">
                  Last meal logged: {formatTimestamp(mealStatus.timestamp)}
				</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col h-full">
              {/* Expanded red background with white text */}
              <div className="bg-red-600 text-white py-10 flex flex-col items-center justify-center rounded-lg shadow-md">
                <h2 className="text-3xl font-bold">{PERSON_NAME} hasn't eaten yet!</h2>
				  {/* Show last meal time if status auto-expired */}
				  {mealStatus.last_meal_timestamp && (
					<p className="text-white">
					  {PERSON_NAME}'s last meal was more than 3 hours ago.<br></br>
					  {formatTimestamp(mealStatus.last_meal_timestamp)}
					</p>
				  )}
              </div>

            </div>
          )}
		  <div className="mt-4 w-full max-w-md mx-auto">
                  <div className="bg-white p-4 rounded-lg shadow-md">
                    <h3 className="font-bold text-gray-700 mb-2">Send a meal reminder to {PERSON_NAME}!</h3>

                    {/* Sender field */}
                    <div className="mb-3">
                      <label className="block text-sm text-gray-600 mb-1 text-left">From:</label>
                      <input
                        type="text"
                        value={reminderSender}
                        onChange={(e) => setReminderSender(e.target.value)}
                        placeholder="Guest"
                        className="w-full p-2 border border-gray-300 rounded"
                      />
                    </div>

                    {/* Message field */}
                    <div className="mb-1">
                      <label className="block text-sm text-gray-600 mb-1 text-left">Message:</label>
                      <textarea
                        value={reminderMessage}
                        onChange={(e) => setReminderMessage(e.target.value)}
                        placeholder="Time to eat!"
                        className="w-full sm:p-0 md:p-1 lg:p-2 border border-gray-300 rounded"
                        rows="2"
                      ></textarea>
                    </div>

                    <div className="flex space-x-2">
                      <button
                        onClick={sendReminder}
                        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-green-600"
                        disabled={reminderSending}
                      >
                        {reminderSending ? 'Sending...' : 'Send Meal Reminder'}
                      </button>
                      <button
                        onClick={() => setShowReminderInput(false)}
                        className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>

        </div>
      )}
    </div>
  );
}

export default App;
