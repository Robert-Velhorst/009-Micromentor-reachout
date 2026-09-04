const packageInput = document.getElementById("handoff");
const fillButton = document.getElementById("fill");
const clearButton = document.getElementById("clear");
const recipient = document.getElementById("recipient");
const status = document.getElementById("status");

let approvedHandoff = null;

function microMentorUrl(value) {
  const parsed = new URL(value);
  const hostname = parsed.hostname.toLowerCase();
  if (
    parsed.protocol !== "https:" || parsed.port || parsed.username || parsed.password ||
    (hostname !== "micromentor.org" && !hostname.endsWith(".micromentor.org"))
  ) {
    throw new Error("The package does not point to a MicroMentor profile.");
  }
  return parsed;
}

function comparableProfileUrl(value) {
  const parsed = microMentorUrl(value);
  const hostname = parsed.hostname.toLowerCase();
  const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
  const appProfileMatch =
    hostname === "app.micromentor.org"
      ? pathname.match(/^\/profile\/([A-Za-z0-9_-]+)$/) ||
        pathname.match(/^\/profile\/invite\/([A-Za-z0-9_-]+)$/)
      : null;
  if (appProfileMatch) return `${hostname}/profile/${appProfileMatch[1]}`;
  const classicProfileMatch =
    hostname === "classic.micromentor.org"
      ? pathname.match(/^\/mentors\/[^/]+$/)
      : null;
  if (classicProfileMatch) return `${hostname}${pathname}`;
  throw new Error("The URL is not a supported MicroMentor mentor profile.");
}

function parseHandoff(value) {
  const payload = JSON.parse(value);
  if (payload?.kind !== "maro-manual-handoff" || payload?.version !== 1) {
    throw new Error("This is not a supported MARO handoff package.");
  }
  if (
    !payload.messageDraftId ||
    !payload.mentorProfileId ||
    !payload.mentorName
  ) {
    throw new Error("The handoff package is incomplete.");
  }
  if (typeof payload.subject !== "string" || payload.subject.length > 500) {
    throw new Error("The approved subject is invalid.");
  }
  if (
    typeof payload.body !== "string" ||
    !payload.body.trim() ||
    payload.body.length > 20000
  ) {
    throw new Error("The approved message body is invalid.");
  }
  if (!payload.profileUrl) {
    throw new Error("The mentor profile URL is missing.");
  }
  microMentorUrl(payload.profileUrl);
  const expiresAt = new Date(payload.expiresAt).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new Error(
      "This handoff package expired. Copy a fresh package from MARO."
    );
  }
  return payload;
}

function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function validateInput() {
  approvedHandoff = null;
  fillButton.disabled = true;
  recipient.hidden = true;
  const value = packageInput.value.trim();
  if (!value) {
    setStatus("Waiting for an approved package.");
    return;
  }
  try {
    approvedHandoff = parseHandoff(value);
    recipient.textContent = `${approvedHandoff.mentorName} - approved ${new Date(approvedHandoff.approvedAt).toLocaleString()}`;
    recipient.hidden = false;
    fillButton.disabled = false;
    setStatus(
      "Package verified. Open the matching MicroMentor profile and fill when ready."
    );
  } catch (error) {
    setStatus(
      error instanceof Error ? error.message : "Invalid handoff package.",
      true
    );
  }
}

function fillApprovedDraft(subject, body, guard) {
  // The tab may navigate after the popup checked it. Verify again in the target.
  const expiresAt = new Date(guard?.expiresAt).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return { filledBody: false, filledSubject: false, blockedReason: "This handoff package expired. Copy a fresh package from MARO." };
  }
  const currentUrl = new URL(window.location.href);
  let currentPath = currentUrl.pathname.replace(/\/+$/, "") || "/";
  if (currentUrl.hostname === "app.micromentor.org") {
    currentPath = currentPath.replace(/^\/profile\/invite\//, "/profile/");
  }
  if (currentUrl.protocol !== "https:" || currentUrl.port || currentUrl.username || currentUrl.password ||
      `${currentUrl.hostname}${currentPath}` !== guard?.profile) {
    return { filledBody: false, filledSubject: false, blockedReason: "The page changed and no longer matches the approved mentor profile." };
  }
  const needsFocusedFlutterEditor = Boolean(document.querySelector("flt-glass-pane"));
  const visible = element => {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      rect.width > 0 &&
      rect.height > 0 &&
      !element.disabled &&
      !element.readOnly
    );
  };
  const description = element => {
    const label = element.labels
      ? Array.from(element.labels)
          .map(item => item.textContent || "")
          .join(" ")
      : "";
    return `${element.name || ""} ${element.id || ""} ${element.placeholder || ""} ${element.getAttribute("aria-label") || ""} ${label}`.toLowerCase();
  };
  const score = (element, positive, negative = []) => {
    const text = description(element);
    let value = positive.reduce(
      (total, term) => total + (text.includes(term) ? 5 : 0),
      0
    );
    value -= negative.reduce(
      (total, term) => total + (text.includes(term) ? 10 : 0),
      0
    );
    return value;
  };
  const setValue = (element, value) => {
    if (element.isContentEditable) {
      element.focus();
      element.textContent = value;
    } else {
      const prototype =
        element instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
      setter ? setter.call(element, value) : (element.value = value);
      element.focus();
    }
    element.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: value,
      })
    );
    element.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const subjectCandidates = Array.from(
    document.querySelectorAll('input:not([type]), input[type="text"]')
  ).filter(visible);
  const subjectField = subjectCandidates
    .map(element => ({
      element,
      score: score(element, ["subject", "onderwerp"]),
    }))
    .sort((left, right) => right.score - left.score)[0];

  const bodyCandidates = Array.from(
    document.querySelectorAll(
      'textarea, [contenteditable="true"][role="textbox"]'
    )
  ).filter(visible);
  const rankedBodies = bodyCandidates
    .map(element => ({
      element,
      score: score(
        element,
        ["message", "bericht", "body", "contact", "introduction"],
        ["search", "comment", "note"]
      ),
    }))
    .sort((left, right) => right.score - left.score);
  const bodyField =
    rankedBodies[0] && (rankedBodies[0].score > 0 || rankedBodies.length === 1)
      ? rankedBodies[0].element
      : null;

  if (!bodyField) {
    return {
      filledBody: false,
      filledSubject: false,
      needsFocusedFlutterEditor,
    };
  }
  if (subject && subjectField?.score > 0)
    setValue(subjectField.element, subject);
  setValue(bodyField, body);
  return {
    filledBody: true,
    filledSubject: Boolean(subject && subjectField?.score > 0),
    needsFocusedFlutterEditor: false,
  };
}

async function copyFallback() {
  const handoff = parseHandoff(packageInput.value.trim());
  await navigator.clipboard.writeText(
    `Subject: ${handoff.subject}\n\n${handoff.body}`
  );
}

packageInput.addEventListener("input", validateInput);
clearButton.addEventListener("click", () => {
  packageInput.value = "";
  validateInput();
  packageInput.focus();
});

fillButton.addEventListener("click", async () => {
  if (!approvedHandoff || fillButton.disabled) return;
  validateInput();
  if (!approvedHandoff) return;
  fillButton.disabled = true;
  packageInput.disabled = true;
  clearButton.disabled = true;
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    // A popup can remain open beyond the package lifetime, including during lookup.
    approvedHandoff = parseHandoff(packageInput.value.trim());
    if (!tab?.id || !tab.url)
      throw new Error("Open the mentor's MicroMentor profile first.");
    if (
      comparableProfileUrl(tab.url) !==
      comparableProfileUrl(approvedHandoff.profileUrl)
    ) {
      throw new Error(
        "The active tab does not match the approved mentor profile."
      );
    }
    const [execution] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: fillApprovedDraft,
      args: [approvedHandoff.subject, approvedHandoff.body, {
        profile: comparableProfileUrl(approvedHandoff.profileUrl),
        expiresAt: approvedHandoff.expiresAt,
      }],
    });
    if (execution?.result?.blockedReason) {
      setStatus(execution.result.blockedReason, true);
      return;
    }
    if (!execution?.result?.filledBody) {
      await copyFallback();
      setStatus(
        execution?.result?.needsFocusedFlutterEditor
          ? "MicroMentor needs its message box activated first. Close this popup, click \"Customize your message\", then reopen MARO and fill again. The approved message was copied for manual paste."
          : "No message field was found. The approved message was copied for manual paste.",
        true
      );
      return;
    }
    setStatus(
      execution.result.filledSubject
        ? "Subject and message filled. Review them on MicroMentor before sending."
        : "Message filled. Review it on MicroMentor before sending."
    );
  } catch (error) {
    if (new Date(approvedHandoff?.expiresAt).getTime() <= Date.now()) {
      validateInput();
      return;
    }
    try {
      await copyFallback();
      setStatus(
        `${error instanceof Error ? error.message : "Handoff failed"} The approved message was copied instead.`,
        true
      );
    } catch {
      setStatus(
        error instanceof Error
          ? error.message
          : "Unable to fill the approved draft.",
        true
      );
    }
  } finally {
    packageInput.disabled = false;
    clearButton.disabled = false;
    fillButton.disabled = !approvedHandoff;
  }
});
