import axios from "axios";
import fs from "fs/promises";
import dotenv from "dotenv";

dotenv.config();

const [, , start, end] = process.argv;

if (!start || !end) {
  console.error(
    "Usage: node tools/run-jira-query.js <start-date> <end-date>"
  );
  process.exit(1);
}

// Hardcoded values - always FRON project with Done status
const project = "FRON";
const status = "Done";

const { JIRA_EMAIL, JIRA_TOKEN } = process.env;

if (!JIRA_EMAIL || !JIRA_TOKEN) {
  console.error("Missing JIRA_EMAIL or JIRA_TOKEN in .env");
  process.exit(1);
}

(async () => {
  const jql = `project = "${project}" AND statusCategory = ${status} AND statusCategoryChangedDate >= ${start} AND statusCategoryChangedDate <= ${end} ORDER BY created DESC`;
  const encoded = encodeURIComponent(jql);

  try {
    const response = await axios.get(
      `https://asaptire.atlassian.net/rest/api/3/search?jql=${encoded}&maxResults=1000`,
      {
        auth: {
          username: JIRA_EMAIL,
          password: JIRA_TOKEN,
        },
        headers: { Accept: "application/json" },
      }
    );

    await fs.writeFile(
      "jira-results.json",
      JSON.stringify(response.data, null, 2)
    );
    console.log("✅ Saved Jira results to jira-results.json");
  } catch (error) {
    console.error("❌ Error fetching Jira issues:", error.message);
  }
})();
