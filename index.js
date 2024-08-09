require("dotenv").config();
const Octokit = require("@octokit/rest");
const fetch = require("node-fetch");
const fs = require("fs");

const {
  GIST_ID: gistId,
  GITHUB_TOKEN: githubToken,
  STRAVA_ATHLETE_ID: stravaAtheleteId,
  STRAVA_REFRESH_TOKEN: stravaRefreshToken,
  STRAVA_CLIENT_ID: stravaClientId,
  STRAVA_CLIENT_SECRET: stravaClientSecret,
} = process.env;
const API_BASE = "https://www.strava.com/api/v3/athletes/";
const AUTH_CACHE_FILE = "strava-auth.json";

const octokit = new Octokit({
  auth: `token ${githubToken}`
});

async function main() {
  const stats = await getStravaActivities();
  await updateGist(stats);
}

/**
 * Updates cached strava authentication tokens if necessary
 */
async function getStravaToken(){
  // default env vars
  let cache = {
    // stravaAccessToken: stravaAccessToken,
    stravaRefreshToken: stravaRefreshToken
  };
  // read cache from disk
  try {
    const jsonStr = fs.readFileSync(AUTH_CACHE_FILE);
    const c = JSON.parse(jsonStr);
    Object.keys(c).forEach(key => {
      cache[key] = c[key];
    });
  } catch (error) {
    console.log(error);
  }
  console.debug(`ref: ${cache.stravaRefreshToken.substring(0,6)}`);

  // get new tokens
  const data = await fetch("https://www.strava.com/oauth/token", {
    method: 'post',
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: stravaClientId,
      client_secret: stravaClientSecret,
      refresh_token: cache.stravaRefreshToken
    }),
    headers: {'Content-Type': 'application/json'},
  }).then(
    data => data.json()
  );
  cache.stravaAccessToken = data.access_token;
  cache.stravaRefreshToken = data.refresh_token;
  console.debug(`acc: ${cache.stravaAccessToken.substring(0,6)}`);
  console.debug(`ref: ${cache.stravaRefreshToken.substring(0,6)}`);

  // save to disk
  fs.writeFileSync(AUTH_CACHE_FILE, JSON.stringify(cache));

  return cache.stravaAccessToken;
}

/**
 * Fetches your data from the Strava API
 * The distance returned by the API is in meters
 */
async function getStravaStats() {
  const API = `${API_BASE}${stravaAtheleteId}/stats?access_token=${await getStravaToken()}`;

  const json = await fetch(API).then(data => data.json());
  return json;
}


async function getStravaActivities() {
  const API = 'https://www.strava.com/api/v3/athlete/activities?per_page=5';

  const json = await fetch(API, {
    method: 'get',
    headers: {
      'Authorization': `Bearer ${await getStravaToken()}`
    }
  }).then(data => data.json());
  return json;
}

async function updateGist(data) {
  let gist;
  try {
    gist = await octokit.gists.get({ gist_id: gistId });
  } catch (error) {
    console.error(`Unable to get gist\n${error}`);
    throw error;
  }
  lines = []
  for (let activity of data) {
    distance = (activity.distance / 1000).toFixed(2);
    average_speed = 1000 / activity.average_speed;
    average_speed_str = ((average_speed / 60) + '').padStart(2, '0') + ':' + ((average_speed % 60) + '').padStart(2, '0');
    type = activity.type.padEnd(4);
    start_date = activity.start_date.substring(0, 10);
    lines.push(`${type} | ${start_date} | ${distance}km | ${average_speed_str}/km`);
  }

  try {
    // Get original filename to update that same file
    const filename = Object.keys(gist.data.files)[0];
    await octokit.gists.update({
      gist_id: gistId,
      files: {
        [filename]: {
          filename: `Recent Strava Activities`,
          content: lines.join("\n")
        }
      }
    });
  } catch (error) {
    console.error(`Unable to update gist\n${error}`);
    throw error;
  }
}

(async () => {
  await main();
})();
