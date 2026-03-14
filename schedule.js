// Schedule Engine — config-driven daily routine
// Reads blocks from config.json, supports overrides from data/schedule-override.json
// Times wrap around midnight (blocks after midnight are "next day")

const fs = require('fs');
const path = require('path');

// Load config
function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
  } catch (e) {
    console.error('[SCHEDULE] Failed to load config.json:', e.message);
    return { schedule: { anchor: '09:00', blocks: [] }, timezone: 'UTC', timezoneOffset: 0 };
  }
}

// Load blocks: check for daily override, fall back to config
function loadBlocks() {
  const overridePath = path.join(__dirname, 'data', 'schedule-override.json');
  try {
    if (fs.existsSync(overridePath)) {
      const data = JSON.parse(fs.readFileSync(overridePath, 'utf8'));
      if (data.blocks && data.blocks.length > 0) {
        return data.blocks;
      }
    }
  } catch (e) {}
  return loadConfig().schedule.blocks;
}

// Parse anchor time from config (e.g., "09:00" → 540 minutes)
function getAnchorMinutes() {
  const config = loadConfig();
  const anchor = config.schedule.anchor || '09:00';
  const [h, m] = anchor.split(':').map(Number);
  return h * 60 + m;
}

// Convert time string to "minutes since anchor"
function toMinutesSinceAnchor(timeStr) {
  const anchorMins = getAnchorMinutes();
  const [h, m] = timeStr.split(':').map(Number);
  let mins = h * 60 + m;
  // Times before anchor are "next day" — add 24h
  if (mins < anchorMins) mins += 1440;
  return mins - anchorMins;
}

// Get current time in configured timezone
function getLocalTime() {
  const config = loadConfig();
  const offset = config.timezoneOffset || 0;
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + offset * 60 * 60000);
}

function getCurrentSchedule(sleepOffset = 0) {
  const config = loadConfig();
  const BLOCKS = loadBlocks();
  const local = getLocalTime();
  const anchorMins = getAnchorMinutes();
  const nowMins = local.getHours() * 60 + local.getMinutes();

  // Convert to minutes since anchor
  let nowSinceAnchor = nowMins < anchorMins ? (nowMins + 1440 - anchorMins) : (nowMins - anchorMins);

  let currentBlock = null;
  let nextBlock = null;
  let currentIdx = -1;

  for (let i = 0; i < BLOCKS.length; i++) {
    const start = toMinutesSinceAnchor(BLOCKS[i].start) + sleepOffset;
    const end = toMinutesSinceAnchor(BLOCKS[i].end) + sleepOffset;

    if (nowSinceAnchor >= start && nowSinceAnchor < end) {
      currentBlock = {
        ...BLOCKS[i],
        minutesLeft: end - nowSinceAnchor,
        minutesElapsed: nowSinceAnchor - start,
        totalMinutes: end - start
      };
      currentIdx = i;
      if (i + 1 < BLOCKS.length) {
        nextBlock = BLOCKS[i + 1];
      }
      break;
    }
  }

  // If no current block, find the next upcoming one
  if (!currentBlock) {
    for (let i = 0; i < BLOCKS.length; i++) {
      const start = toMinutesSinceAnchor(BLOCKS[i].start) + sleepOffset;
      if (nowSinceAnchor < start) {
        nextBlock = BLOCKS[i];
        break;
      }
    }
  }

  const mode = currentBlock ? currentBlock.mode : 'idle';

  // Format time — getLocalTime() already applied timezone offset,
  // so we format without timeZone to avoid double-offsetting
  const hh = local.getHours();
  const mm = local.getMinutes();
  const ampm = hh >= 12 ? 'PM' : 'AM';
  const h12 = hh % 12 || 12;
  const timeLocal = `${h12.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')} ${ampm}`;
  
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dateLocal = `${days[local.getDay()]}, ${months[local.getMonth()]} ${local.getDate()}`;

  return {
    mode,
    currentBlock,
    nextBlock,
    currentIdx,
    blocks: BLOCKS,
    timestamp: local.toISOString(),
    timeLocal,
    dateLocal,
  };
}

module.exports = { getCurrentSchedule, loadBlocks, getLocalTime, loadConfig };
