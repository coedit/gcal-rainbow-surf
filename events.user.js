// ==UserScript==
// @name        Rainbow.surf - Event merge to rainbow + weekend colors for Google Calendar (curated by @ezdub - code by @imightbeAmy and @karjna and @msteffen)
// @namespace   gcal-rainbow-surf
// @include     https://calendar.google.com/*
// @version     2.4.1
// @grant       none
// ==/UserScript==

'use strict';

const style = document.createElement('style');
// the background color effect on "Maybe" events is added by gmail class and we override it for better visible style
style.textContent = `
.KF4T6b:not(.smECzc).Epw9Dc {
  background-size: 12px 12px; // original size of the background effect on "Maybe" events 
}
.KF4T6b:not(.smECzc).Epw9Dc.dedupe {
  background-size: 66px; // set the "Maybe" background effect repeat on our merged events
}


`;
document.head.appendChild(style);

function hexToRgb(hex) {
  const sanitizedHex = hex.replace(/^#/, '');
  const bigint = parseInt(sanitizedHex, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return [r, g, b];
}

function relativeLuminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const sRgb = v / 255;
    return sRgb <= 0.03928 ? sRgb / 12.92 : Math.pow((sRgb + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// https://www.w3.org/TR/2008/REC-WCAG20-20081211/#contrast-ratiodef
function contrastRatio(L1, L2) {
  return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
}

const rainbow = (colors, width, angle) => {
  let gradient = `linear-gradient( to right,`;
  let pos = 0;

  colors.forEach((color) => {
    gradient += color + ',';
    // pos += width;
    // gradient += color + ",";
  });
  gradient = gradient.slice(0, -1);
  gradient += ')';
  return gradient;
};

const dragType = (e) => parseInt(e.dataset.dragsourceType);

const calculatePosition = (event, parentPosition) => {
  const eventPosition = event.getBoundingClientRect();
  return {
    left: Math.max(eventPosition.left - parentPosition.left, 0),
    right: parentPosition.right - eventPosition.right,
  };
};

const mergeEventElements = (events) => {
  events.sort((e1, e2) => dragType(e1) - dragType(e2));
  const colors = events.map(
    (event) =>
      event.style.backgroundColor || // Week day and full day events marked 'attending'
      event.style.borderColor || // Not attending or not responded week view events
      event.parentElement.style.borderColor // Timed month view events
  );

  const parentPosition = events[0].parentElement.getBoundingClientRect();
  const positions = events.map((event) => {
    event.originalPosition = event.originalPosition || calculatePosition(event, parentPosition);
    return event.originalPosition;
  });

  const eventToKeep = events.shift();
  // Set visibility once for all other events
  events.forEach((event) => {
    event.style.visibility = 'hidden';
  });

  if (eventToKeep.style.backgroundColor || eventToKeep.style.borderColor) {
    eventToKeep.originalStyle = eventToKeep.originalStyle || {
      backgroundImage: eventToKeep.style.backgroundImage,
      // backgroundSize: eventToKeep.style.backgroundSize,
      left: eventToKeep.style.left,
      right: eventToKeep.style.right,
      visibility: eventToKeep.style.visibility,
      width: eventToKeep.style.width,
      border: eventToKeep.style.border,
    };
    var newColors = [];
    colors.forEach((color) => newColors.push(color.toString().replace(')', ', 0.75)').replace('rgb', 'rgba')));
    eventToKeep.style.backgroundImage = rainbow(newColors, 10, 45);
    eventToKeep.style.backgroundColor = 'unset';
    eventToKeep.classList.add('dedupe');
    eventToKeep.style.left =
      Math.min.apply(
        Math,
        positions.map((s) => s.left)
      ) + 'px';
    eventToKeep.style.right =
      Math.min.apply(
        Math,
        positions.map((s) => s.right)
      ) + 'px';
    eventToKeep.style.visibility = 'visible';
    eventToKeep.style.width = null;
    eventToKeep.style.border = 'none';//solid 1px #FFF';

    // Clear setting color for declined events
    eventToKeep.querySelector('[aria-hidden="true"]').style.color = null;
  } else {
    const dots = eventToKeep.querySelector('[role="button"] div:first-child');
    const dot = dots.querySelector('div');
    dot.style.backgroundImage = rainbow(colors, 4, 90);
    dot.style.width = colors.length * 4 + 'px';
    dot.style.borderWidth = 0;
    dot.style.height = '8px';
  }
};

const resetMergedEvents = (events) => {
  events.forEach((event) => {
    for (let k in event.originalStyle) {
      event.style[k] = event.originalStyle[k];
    }
    event.style.visibility = 'visible';
  });
};

const merge = (mainCalender) => {
  const eventSets = {};
  const days = mainCalender.querySelectorAll('[role="gridcell"]');
  days.forEach((day, index) => {
    const events = Array.from(day.querySelectorAll('[data-eventid][role="button"], [data-eventid] [role="button"]'));
    events.forEach((event) => {
      const eventTitleEls = event.querySelectorAll('[aria-hidden="true"]');
      if (!eventTitleEls.length) {
        return;
      }
      let eventKey = Array.from(eventTitleEls)
        .map((el) => el.textContent)
        .join('')
        .replace(/\\s+/g, '');
      eventKey = index + '_' + eventKey + event.style.height;
      eventSets[eventKey] = eventSets[eventKey] || [];
      eventSets[eventKey].push(event);
    });
  });

  let daysWithMergedEvents = [];

  Object.entries(eventSets).forEach((eventSet) => {
    const index = eventSet[0].split('_')[0];
    const events = eventSet[1];
    if (events.length > 1) {
      const length = events.length;
      mergeEventElements(events);
      daysWithMergedEvents.push({ index: index, amount: length });
    } else {
      resetMergedEvents(events);
      const day = daysWithMergedEvents.find((day) => day.index === index);
      if (day) {
        moveOtherEvents(events, day.amount);
      }
    }
  });
};

let otherEventsMoved = [];

const moveOtherEvents = (events, amount) => {
  if (!otherEventsMoved.includes(events[0])) {
    const originalTop = events[0].parentElement.style.top;
    events[0].parentElement.style.top = `${parseInt(originalTop) - (amount - 1)}em`;
    otherEventsMoved.push(events[0]);
  }
};

const init = (mutationsList) => {
  mutationsList &&
    mutationsList
      .map((mutation) => mutation.addedNodes[0] || mutation.target)
      .filter((node) => node.matches && node.matches('[role="main"], [role="dialog"]')) //, [role="grid"]'))  //TODO grid really slows down moving around on Schedule view and merge doesn't happen there anyways
      .map(merge);
};

const observer = new MutationObserver(init);
observer.observe(document.body, { childList: true, subtree: true, attributes: true });

// weekender - make weekends great again
// big thanks to @msteffen for doing the hard parts :D  https://github.com/msteffen/gcal-gray-weekends
// this includes small calendars ("main menu" & event edit) too
// dark mode color for weekend background based on contrast ratio coded by @TraumaER
function getWeekendBgColor(miniCalendar = false) {
  const lightModeWkndBgColor = document.querySelector('html[data-darkreader-mode]') ? '#dce9ff' : '#f1f6ff';
  const darkModeWkndBgColor = '#0f192c';
  const miniLightModeWkndBgColor = document.querySelector('html[data-darkreader-mode]') ? '#cacdff' : '#e6efff';
  const miniDarkModeWkndBgColor = '#102c61';
  const lightColor = miniCalendar ? miniLightModeWkndBgColor : lightModeWkndBgColor;
  const darkColor = miniCalendar ? miniDarkModeWkndBgColor : darkModeWkndBgColor;
  const lightLum = relativeLuminance(lightColor);
  const darkLum = relativeLuminance(darkColor);
  const metaThemeElement = document.querySelector('meta[name="theme-color"]');
  let weekendBgColor;

  if (metaThemeElement) {
    try {
      const themeLum = relativeLuminance(metaThemeElement.getAttribute('content'));
      const lightRatio = contrastRatio(themeLum, lightLum);
      const darkRatio = contrastRatio(themeLum, darkLum);

      // Lowest contrast ratio wins as that will be the less stark color.
      weekendBgColor = lightRatio <= darkRatio ? lightColor : darkColor;
    } catch (e) {
      console.error(e);
    }
  }

  return weekendBgColor;
}

//this should give us S for Saturday or localized day name - assumes browser locale and google calendar settings match
const weekendDay1 = new Date(2021, 6, 3).toLocaleString('default', { weekday: 'long' }).slice(0, 1);
//this should give us S for Sunday or localized day name - assumes browser locale and google calendar settings match
const weekendDay2 = new Date(2021, 6, 4).toLocaleString('default', { weekday: 'long' }).slice(0, 1);

function colorBgWeekends(mutList) {
  if (mutList != undefined) {
    mutList
      .map((mutation) => mutation.addedNodes[0] || mutation.target)
      .filter((node) => node.matches && node.matches("[role='main']"))
      .map(colorBgDay);
  }
}

function colorBgDay(mainCal) {
  const weekendBgColor = getWeekendBgColor();
  var nodes = mainCal.querySelectorAll("div[role='columnheader'],div[data-datekey]:not([jsaction])");
  for (const node of nodes) {
    if (node.getAttribute('role') == 'columnheader') {
      if (node.children[0].innerHTML[0] == weekendDay1 || node.children[0].innerHTML[0] == weekendDay2) {
        node.style.backgroundColor = weekendBgColor;
      }
      continue;
    }
    var datekey = node.getAttribute('data-datekey');
    if (!datekey) {
      console.log("could not read expected attribute 'data-datekey'");
      continue;
    }
    datekey = parseInt(datekey);
    var year = datekey >> 9;
    var month = (datekey & 511) >> 5;
    var day = datekey & 31;
    var date = new Date(
      1970 + year,
      month - 1, // JS date indexes months from 0 for some reason
      day
    );
    var dayOfWeek = date.getDay();
    if (dayOfWeek == 0 || dayOfWeek == 6) {
      node.style.backgroundColor = weekendBgColor;
    }
  }
}

const bigGrid = new MutationObserver(colorBgWeekends);
bigGrid.observe(document.body, { subtree: true, childList: true, attributes: true });
bigGrid.observe(document.querySelector('meta[name="theme-color"]'), { attributes: true });

function minicolorBgWeekends(mutList) {
  if (mutList != undefined) {
    mutList
      .map((mutation) => mutation.addedNodes[0] || mutation.target)
      .filter(
        (node) => (node.matches && node.matches('div[data-month]')) || (node.matches && node.matches('div[data-ical]'))
      )
      .map(minicolorBgDay);
  }
}

function minicolorBgDay(miniCal) {
  const weekendBgColor = getWeekendBgColor(true);
  const today = new Date();
  const todayString = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(
    today.getDate()
  ).padStart(2, '0')}`;
  var nodes = miniCal.querySelectorAll('td[data-date] button');
  for (const node of nodes) {
    var d = node.parentElement.getAttribute('data-date');
    if (!d) {
      console.error("could not read expected attribute 'data-date'");
      continue;
    }
    var dt = new Date(d.slice(0, 4), d.slice(4, 6) - 1, d.slice(6, 8));
    var selected = node.getAttribute('aria-pressed');
    if (dt.getDay() == 6 || dt.getDay() == 0) {
      if (selected == 'true' || d === todayString) {
        node.style.removeProperty('background-color'); // uncolor selected date
      } else {
        node.style.backgroundColor = weekendBgColor;
        // node.querySelector('div').style.backgroundColor = weekendBgColor;
      }
    }
  }
}

const menuMiniMonth = new MutationObserver(minicolorBgWeekends);
menuMiniMonth.observe(document.body, { subtree: true, childList: true, attributes: true });
menuMiniMonth.observe(document.querySelector('html'), { attributes: true, attributeFilter: ['data-darkreader-mode'] });
menuMiniMonth.observe(document.querySelector('meta[name="theme-color"]'), { attributes: true });

//  minicolorBgDay for year view months
const yearViewMiniMonth = new MutationObserver(() => {
  if (!document.body.hasAttribute('data-viewkey')) return;
  document.querySelectorAll('div[data-month], div[data-ical], div[role]').forEach(minicolorBgDay);
});

yearViewMiniMonth.observe(document.body, {
  attributes: true,
  subtree: true,
  childList: true,
  attributeFilter: ['data-viewkey'],
});
yearViewMiniMonth.observe(document.querySelector('html'), {
  attributes: true,
  attributeFilter: ['data-darkreader-mode'],
});
yearViewMiniMonth.observe(document.querySelector('meta[name="theme-color"]'), { attributes: true });
