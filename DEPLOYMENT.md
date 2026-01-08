# Deployment Guide - Render

## Prerequisites
- GitHub account with your repository
- Render account (free tier available at https://render.com)

## Deployment Steps

### 1. Create New Web Service on Render

1. Go to https://dashboard.render.com
2. Click "New +" and select "Web Service"
3. Connect your GitHub repository: `arlindi19994-prog/activitytracker`
4. Configure the service:
   - **Name**: activity-tracker (or your preferred name)
   - **Region**: Choose closest to your users
   - **Branch**: main
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free

### 2. Environment Variables (Optional)

Add these in Render Dashboard under "Environment":

- `NODE_ENV` = `production`
- `JWT_SECRET` = (Auto-generated or set your own secure key)

### 3. Deploy

Click "Create Web Service" - Render will automatically:
- Clone your repository
- Install dependencies
- Start the server
- Provide you with a URL like: `https://activity-tracker-xxxx.onrender.com`

### 4. Post-Deployment

- The default admin account will be created automatically: `admin` / `admin123`
- **Important**: Change the default password immediately after first login!
- Database is stored on the server filesystem (SQLite)

### 5. Important Notes

⚠️ **Free Tier Limitations:**
- Service spins down after 15 minutes of inactivity
- First request after spin-down will be slow (cold start ~30 seconds)
- Database data persists but is tied to the instance
- 750 hours/month free usage

⚠️ **Database Considerations:**
- SQLite works fine for small teams (< 50 users)
- Data is not backed up automatically on free tier
- For production, consider upgrading to paid tier or using PostgreSQL

### 6. Custom Domain (Optional)

1. Go to your service settings
2. Add custom domain under "Custom Domains"
3. Update DNS records as instructed

## Monitoring

- View logs in Render Dashboard under "Logs" tab
- Set up health checks and alerts in settings

## Updating the Application

Simply push changes to your GitHub repository:
```bash
git add .
git commit -m "Update description"
git push origin main
```

Render will automatically detect changes and redeploy!

## Troubleshooting

### Cold Starts
- Free tier services sleep after inactivity
- First request wakes up the service (30s delay)
- Consider upgrading to paid tier for always-on service

### Database Issues
- If database gets corrupted, delete and redeploy
- Default admin will be recreated
- Consider regular manual backups for important data

### Email Notifications
- Email features require SMTP configuration
- Add EMAIL_HOST, EMAIL_USER, EMAIL_PASS environment variables
- Gmail requires "App Password" (2FA enabled)

## Support

For issues, check:
- Render logs in dashboard
- GitHub repository issues
- Render documentation: https://render.com/docs
