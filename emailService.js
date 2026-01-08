const nodemailer = require('nodemailer');
const { db } = require('./database');

// Create a test transporter (in production, use real SMTP credentials)
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: 'your-email@gmail.com', // Change this
    pass: 'your-app-password'     // Change this
  }
});

// For testing without real email
const testMode = true;

async function sendNotificationEmail(email, activity) {
  const emailTypes = {
    'reminder': {
      subject: `Reminder: Activity "${activity.activity_name}" starts in 3 days`,
      message: 'This is a reminder that your activity is scheduled to start in 3 days.'
    },
    'assignment': {
      subject: `New Activity Assigned: "${activity.activity_name}"`,
      message: 'You have been assigned as the owner of a new activity.'
    },
    'backup_assignment': {
      subject: `Backup Person for Activity: "${activity.activity_name}"`,
      message: 'You have been assigned as the backup person for an activity.'
    },
    'weekly': {
      subject: `Weekly Reminder: Upcoming Activity "${activity.activity_name}"`,
      message: 'This is your weekly reminder about an upcoming activity.'
    }
  };

  const emailType = emailTypes[activity.type || 'reminder'];

  const mailOptions = {
    from: '"Activity Tracker" <noreply@activitytracker.com>',
    to: email,
    subject: emailType.subject,
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f5f5f5;">
        <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 10px;">
          <h2 style="color: #333; margin-bottom: 20px;">Activity Notification</h2>
          <p style="font-size: 16px; color: #555;">${emailType.message}</p>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #333;">${activity.activity_name}</h3>
            <p style="margin: 10px 0;"><strong>Date:</strong> ${activity.activity_date}</p>
            ${activity.priority ? `<p style="margin: 10px 0;"><strong>Priority:</strong> ${activity.priority}</p>` : ''}
            ${activity.status ? `<p style="margin: 10px 0;"><strong>Status:</strong> ${activity.status}</p>` : ''}
            ${activity.department ? `<p style="margin: 10px 0;"><strong>Department:</strong> ${activity.department}</p>` : ''}
          </div>

          <p style="font-size: 14px; color: #777; margin-top: 30px;">
            This is an automated notification from the Activity Tracker system.
          </p>
        </div>
      </div>
    `
  };

  if (testMode) {
    console.log('📧 [TEST MODE] Email would be sent to:', email);
    console.log('Subject:', mailOptions.subject);
    console.log('Type:', activity.type || 'reminder');
    console.log('Activity:', activity.activity_name, 'on', activity.activity_date);
    return;
  }

  try {
    await transporter.sendMail(mailOptions);
    console.log('Email sent to:', email);
  } catch (error) {
    console.error('Error sending email:', error);
  }
}

function checkUpcomingActivities() {
  const threeDaysFromNow = new Date();
  threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
  const targetDate = threeDaysFromNow.toISOString().split('T')[0];

  const query = `
    SELECT a.*, u.notify_email, u.username
    FROM activities a
    JOIN users u ON a.created_by = u.id
    WHERE a.activity_date = ?
      AND a.status IN ('Planned', 'In Progress')
      AND u.notify_email IS NOT NULL
      AND u.notify_email != ''
  `;

  db.all(query, [targetDate], (err, activities) => {
    if (err) {
      console.error('Error checking upcoming activities:', err);
      return;
    }

    activities.forEach(activity => {
      sendNotificationEmail(activity.notify_email, { ...activity, type: 'reminder' });
    });

    console.log(`Checked upcoming activities. Found ${activities.length} to notify.`);
  });
}

function sendWeeklyReminders() {
  const oneWeekFromNow = new Date();
  oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7);
  const startDate = oneWeekFromNow.toISOString().split('T')[0];
  
  const twoWeeksFromNow = new Date();
  twoWeeksFromNow.setDate(twoWeeksFromNow.getDate() + 14);
  const endDate = twoWeeksFromNow.toISOString().split('T')[0];

  const query = `
    SELECT a.*, u.notify_email, u.username
    FROM activities a
    JOIN users u ON a.created_by = u.id
    WHERE a.activity_date BETWEEN ? AND ?
      AND a.status IN ('Planned', 'In Progress')
      AND u.notify_email IS NOT NULL
      AND u.notify_email != ''
  `;

  db.all(query, [startDate, endDate], (err, activities) => {
    if (err) {
      console.error('Error checking weekly reminders:', err);
      return;
    }

    activities.forEach(activity => {
      sendNotificationEmail(activity.notify_email, { ...activity, type: 'weekly' });
    });

    console.log(`Sent weekly reminders for ${activities.length} activities.`);
  });
}

module.exports = {
  sendNotificationEmail,
  checkUpcomingActivities
};
