const fs = require("fs");
const path = require("path");

const HEADER = "longitude,latitude,category,rate,comment,observed_date\n";
const CSV_REL = "data/community_seatings.csv";
const LOCAL_PATH = path.join(process.cwd(), CSV_REL);

function useGithub() {
  return Boolean(process.env.GITHUB_TOKEN);
}

function repoInfo() {
  return {
    token: process.env.GITHUB_TOKEN,
    repo:
      process.env.GITHUB_REPO ||
      "rachelshin-works/seating-as-care-infrastructure",
    branch: process.env.GITHUB_BRANCH || "main",
  };
}

function githubHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "seating-as-care-infrastructure",
  };
}

async function githubGet() {
  const { token, repo, branch } = repoInfo();
  const url = `https://api.github.com/repos/${repo}/contents/${CSV_REL}?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(url, { headers: githubHeaders(token) });

  if (res.status === 404) {
    return { content: HEADER, sha: null };
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`github read ${res.status}: ${text}`);
  }

  const data = await res.json();
  return {
    content: Buffer.from(data.content, "base64").toString("utf8"),
    sha: data.sha,
  };
}

async function githubPut(content, sha) {
  const { token, repo, branch } = repoInfo();
  const url = `https://api.github.com/repos/${repo}/contents/${CSV_REL}`;
  const body = {
    message: "chore: append community seating",
    content: Buffer.from(content, "utf8").toString("base64"),
    branch,
  };
  if (sha) body.sha = sha;

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      ...githubHeaders(token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`github write ${res.status}: ${text}`);
    err.status = res.status;
    throw err;
  }
}

function localRead() {
  if (!fs.existsSync(LOCAL_PATH)) return HEADER;
  return fs.readFileSync(LOCAL_PATH, "utf8");
}

function localAppend(row) {
  if (!fs.existsSync(LOCAL_PATH)) {
    fs.writeFileSync(LOCAL_PATH, HEADER, "utf8");
  }
  fs.appendFileSync(LOCAL_PATH, row, "utf8");
}

async function readCsv() {
  if (useGithub()) {
    const { content } = await githubGet();
    return content;
  }
  return localRead();
}

async function appendLine(line) {
  const row = line.endsWith("\n") ? line : `${line}\n`;

  if (useGithub()) {
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const { content, sha } = await githubGet();
        const base = content.endsWith("\n") || content.length === 0 ? content : `${content}\n`;
        await githubPut(`${base}${row}`, sha);
        return;
      } catch (err) {
        lastErr = err;
        if (err.status !== 409 && err.status !== 422) throw err;
      }
    }
    throw lastErr;
  }

  try {
    localAppend(row);
  } catch (err) {
    const hint =
      "Vercel cannot write local files — set GITHUB_TOKEN in Vercel env vars";
    err.message = `${err.message}; ${hint}`;
    throw err;
  }
}

module.exports = {
  HEADER,
  readCsv,
  appendLine,
  useGithub,
};
