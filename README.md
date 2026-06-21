# FS Task

## IMPORTANT:

THIS TASK MUST BE COMPLETED EXCLUSIVELY BY YOU. NO EXTERNAL HELP OF ANY KIND IS ALLOWED.
IN CASE THESE REQUIREMENTS ARE NOT MET, WE RESERVE THE RIGHT TO WITHHOLD PAYMENT.

### Stack Requirements:

1. Angular Version 19
2. AG Grid C AG Charts (33.0)
3. Angular Material
4. Angular Material Icons
5. Node v22

### Technical Details:

#### Part A:

- We need to create an integration for Airtable
- Here is the documentation: https://airtable.com/developers/web/api/introduction
- Build OAuth Authentication.
- We need to fetch the following endpoints: (BaseURL: https://api.airtable.com/v0)
- Projects (bases) : /meta/bases
- Tables (tables): /meta/bases/${baseId}/tables
- Tickets (pages): /${baseId}/${tableId}
- Users: /Users
- We only need to focus on the above endpoints and store all the pages in a separate MongoDB collection. (Important: Make sure to use Airtable API Pagination)

#### Part B:

- Once we can fetch all the above endpoints, we need to write a Custom Scraping Method for
  changelogs.
- We are looking to fetch Revision History. Refer to the screenshot below to see how the revision
  history appears in Airtable
- We need to write a custom scraping method that should work as follow:
  - We need to automatically retrieve the Cookies from Airtable so we can pass the cookies to the Revision History endpoint (i.e /readRowActivitiesAndComments)
  - We need to ability to check if the cookies are valid.
  - We need to fetch Revision History for each task that we have fetched earlier using the API.
  - The Revision History response is in HTML, we need to parse the response into the following format before storing it to the database:
    `{uuid: <activityId>, issueId: <ticketId>, columnType: <columnType>, oldValue: <oldValue>, newValue: <newValue>, createdDate: new Date(activityDate.createdTime), authoredBy: activityData.originatingUserId}`
- Once we are able to fetch the Revision History, store it in the database.
- You will need to test this with atleast 200 Pages and make sure the revision history is retrieved.
- Important: In the Revision History: We are looking for Assignee and Status Changes
- We need the Custom Scraping Method to automatically retrieve the cookies and pass it to the Airtable Integration Service to get the Revision History for each ticket (page).
- It is important to check if the cookies are valid or not. This can be done by making a request to the endpoints and if the cookies are expired we need to redo it.
- We also need to have the ability to pass the MFA Code from the frontend so we can easily get the cookies and run the Custom Scraping Method.

#### Part C:

- Active Integrations Dropdown: Airtable
- Entity Dropdown: List of Collections in the Airtable database.
- Search: Ability to search keyword in the Easy Grid.
- Apply filter/sorting across all the columns.
- AG Grid Table will display all the fields from the collection. It will get the fields dynamically from the selected collection and display them in the AG Grid.

Note: As part of Task, it is required to build a simple UI to demonstrate the functionality. This will be a key part of the evaluation. Please ensure the UI is clean and user-friendly.

This task is designed to be interpreted as written. Make your own decisions if anything is ambiguous.
Unless absolutely necessary, do not reach out to the team with questions that you can find on your
own.
