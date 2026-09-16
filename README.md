# SHIVIRA JEWELS — Client Ready JSON Edition

Premium jewellery website with an Express backend and JSON file storage.

## Run locally
```bash
npm install
npm start
```
Open: http://localhost:3000

## Owner panel
Open: http://localhost:3000/owner-admin.html

On first run, create the one owner account. After that, only the saved owner credentials can enter the dashboard.

Dashboard includes:
- Orders: customer details, items, total, status, making time and ready date
- Products & Prices: add, edit and delete website products
- Customers: customer order records
- Bookings, Custom Requests and Messages
- Settings: default jewellery making time and customer message
- Owner Account: change username and password
- Maintenance: clear test records without deleting products

## Order flow
Customer checkout creates the order with **Approved** status immediately, calculates the default making time, and returns a bill page instantly. The customer can print/save the bill as PDF.

## JSON storage
All application records are stored in `data/store.json`. This is intentionally simple for a low-volume project. For Vercel production, note that Vercel's serverless filesystem is not a persistent database; use a persistent storage service or a server/host with persistent disk if live records must survive deployments/restarts.
