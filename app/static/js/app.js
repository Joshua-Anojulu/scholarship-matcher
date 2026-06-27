/**
 * Scholarships4U frontend.
 *
 * Logged-out users get the original stateless experience. Logged-in users can
 * save their profile (it prefills on return) and bookmark scholarships. Session
 * state lives in an httponly cookie set by the server, not in browser storage.
 */

let vocabulary = null;
let lastSubmittedProfile = null;
let lastResults = null;

let currentUser = null;
const savedIds = new Set();
let authMode = "login";
let passwordResetToken = null;

const form = document.getElementById("profile-form");
const formError = document.getElementById("form-error");
const profileProgress = document.getElementById("profile-progress");
const profileProgressFill = document.getElementById("profile-progress-fill");
const profileProgressLabel = document.getElementById("profile-progress-label");
const profileProgressStatus = document.getElementById("profile-progress-status");
const resultsSection = document.getElementById("results-section");
const resultsContainer = document.getElementById("results-container");
const resultsSummary = document.getElementById("results-summary");
const resultsEmpty = document.getElementById("results-empty");
const loadingEl = document.getElementById("loading");
const programsSection = document.getElementById("programs-section");
const programsContainer = document.getElementById("programs-container");
const programsSummary = document.getElementById("programs-summary");
const programsEmpty = document.getElementById("programs-empty");
const submitBtn = document.getElementById("submit-btn");

const authLoggedOut = document.getElementById("auth-logged-out");
const authLoggedIn = document.getElementById("auth-logged-in");
const openLoginBtn = document.getElementById("open-login");
const openSignupBtn = document.getElementById("open-signup");
const logoutBtn = document.getElementById("logout-btn");
const accountEmail = document.getElementById("account-email");
const showSavedBtn = document.getElementById("show-saved-btn");
const savedCountEl = document.getElementById("saved-count");

const authModal = document.getElementById("auth-modal");
const authModalTitle = document.getElementById("auth-modal-title");
const authModalIntro = document.getElementById("auth-modal-intro");
const authModalClose = document.getElementById("auth-modal-close");
const authForm = document.getElementById("auth-form");
const authEmail = document.getElementById("auth-email");
const authPassword = document.getElementById("auth-password");
const authPasswordHint = document.getElementById("auth-password-hint");
const authError = document.getElementById("auth-error");
const authSubmit = document.getElementById("auth-submit");
const authSwitchText = document.getElementById("auth-switch-text");
const authSwitchBtn = document.getElementById("auth-switch-btn");
const authRecovery = document.getElementById("auth-recovery");
const openPasswordResetBtn = document.getElementById("open-password-reset");
const passwordResetModal = document.getElementById("password-reset-modal");
const passwordResetClose = document.getElementById("password-reset-close");
const passwordResetTitle = document.getElementById("password-reset-title");
const passwordResetIntro = document.getElementById("password-reset-intro");
const passwordResetRequestForm = document.getElementById("password-reset-request-form");
const passwordResetConfirmForm = document.getElementById("password-reset-confirm-form");
const passwordResetEmail = document.getElementById("password-reset-email");
const passwordResetRequestError = document.getElementById("password-reset-request-error");
const passwordResetRequestSuccess = document.getElementById("password-reset-request-success");
const passwordResetRequestSubmit = document.getElementById("password-reset-request-submit");
const passwordResetNewPassword = document.getElementById("password-reset-new-password");
const passwordResetConfirmPassword = document.getElementById("password-reset-confirm-password");
const passwordResetConfirmError = document.getElementById("password-reset-confirm-error");
const passwordResetConfirmSubmit = document.getElementById("password-reset-confirm-submit");
const passwordResetBack = document.getElementById("password-reset-back");

const savedSection = document.getElementById("saved-section");
const savedSummary = document.getElementById("saved-summary");
const savedEmpty = document.getElementById("saved-empty");
const savedContainer = document.getElementById("saved-container");

const resultsFilters = document.getElementById("results-filters");
const filterQuality = document.getElementById("filter-quality");
const filterSort = document.getElementById("filter-sort");
const filterMinScore = document.getElementById("filter-min-score");
const filterMinScoreValue = document.getElementById("filter-min-score-value");
const filterNoEssay = document.getElementById("filter-no-essay");
const filterFieldMatch = document.getElementById("filter-field-match");
const filterSchoolMatch = document.getElementById("filter-school-match");
const filterDemographicMatch = document.getElementById("filter-demographic-match");
const filterClosingSoon = document.getElementById("filter-closing-soon");
const filterVerifiedOnly = document.getElementById("filter-verified-only");
const filterClear = document.getElementById("filter-clear");

const CRITERIA_HELP = {
  gpa:
    "Used as an eligibility gate when a scholarship publishes a minimum GPA. It does not boost ranking by itself.",
  "grade-level":
    "Used as an eligibility gate. Pick your actual class year; broad sponsor rules like 'high school students' or 'undergraduates' are handled automatically.",
  citizenship:
    "Used as an eligibility gate when the sponsor publishes a citizenship rule. Unverified rules stay visible with a warning.",
  state:
    "Used as an eligibility gate for state-restricted awards. National awards remain available from every state.",
  "financial-need":
    "Adds fit points only for need-based scholarships. It does not hide merit awards or non-need-based awards.",
  "fields-of-study-group":
    "The strongest fit signal. Field-specific scholarships need an exact or approved broad-field match; otherwise they are capped to Possible with a caveat.",
  "demographic-tags-group":
    "Positive-only. These can explain scholarships that mention an identity group, but they never exclude you from results.",
  "target-schools":
    "Adds points for school-specific scholarships at schools you list. If a school-specific award points elsewhere, it is capped from Strong to Possible.",
  activities:
    "Adds a small capped bonus when meaningful activity keywords appear in the scholarship description. It never replaces eligibility.",
};

const LEGACY_GRADE_LABELS = {
  high_school: "High school (saved broad estimate)",
  college_undergraduate: "College undergraduate (saved broad estimate)",
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  try {
    const response = await fetch("/vocabulary");
    if (!response.ok) {
      throw new Error(`Vocabulary request failed (${response.status})`);
    }
    vocabulary = await response.json();
    populateForm(vocabulary);
  } catch (err) {
    showFormError(
      "The form options could not load. Refresh the page. If this keeps happening, check that the server is running."
    );
    submitBtn.disabled = true;
    console.error(err);
  }

  form.addEventListener("submit", handleSubmit);
  wireProfileProgress();
  wirePageMotion();
  wireAuthControls();
  wirePasswordReset();
  wireFilterControls();
  wireResumeImport();
  wireSettings();
  wireAgeGate();
  await loadSession();
}

/* ---------- Page feedback and motion ---------- */

function wireProfileProgress() {
  form.addEventListener("input", updateProfileProgress);
  form.addEventListener("change", updateProfileProgress);
  updateProfileProgress();
}

function updateProfileProgress() {
  if (!profileProgress) {
    return;
  }
  const essentials = [
    document.getElementById("gpa").value.trim() !== "",
    Boolean(document.getElementById("grade-level").value),
    Boolean(document.getElementById("citizenship").value),
    Boolean(document.getElementById("state").value),
    Boolean(document.getElementById("financial-need").value),
    getCheckedValues("fields-of-study").length > 0,
  ];
  const complete = essentials.filter(Boolean).length;
  const percent = Math.round((complete / essentials.length) * 100);

  const progressText =
    complete === essentials.length ? "Profile essentials complete" : `${complete} of 6 essentials`;
  profileProgress.setAttribute("aria-valuenow", String(complete));
  profileProgress.setAttribute("aria-valuetext", progressText);
  profileProgressFill.style.width = `${percent}%`;
  profileProgressLabel.textContent = progressText;
  profileProgressStatus.textContent =
    complete === essentials.length ? "Ready to see your matches" : "Add the essentials to continue";
  form.classList.toggle("profile-ready", complete === essentials.length);
}

function wirePageMotion() {
  const updateHeader = () => {
    document.body.classList.toggle("has-scrolled", window.scrollY > 8);
  };
  updateHeader();
  window.addEventListener("scroll", updateHeader, { passive: true });

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }
  const targets = document.querySelectorAll(".reveal-on-scroll");
  if (!("IntersectionObserver" in window) || targets.length === 0) {
    return;
  }
  document.documentElement.classList.add("motion-ready");
  const observer = new IntersectionObserver(
    (entries, currentObserver) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          currentObserver.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.12 }
  );
  for (const target of targets) {
    observer.observe(target);
  }
}

/* ---------- Results filtering ---------- */

function wireFilterControls() {
  filterQuality.addEventListener("change", rerenderResults);
  filterSort.addEventListener("change", rerenderResults);
  filterMinScore.addEventListener("input", () => {
    filterMinScoreValue.textContent = filterMinScore.value;
    rerenderResults();
  });
  filterNoEssay.addEventListener("change", rerenderResults);
  filterFieldMatch.addEventListener("change", rerenderResults);
  filterSchoolMatch.addEventListener("change", rerenderResults);
  filterDemographicMatch.addEventListener("change", rerenderResults);
  filterClosingSoon.addEventListener("change", rerenderResults);
  filterVerifiedOnly.addEventListener("change", rerenderResults);
  filterClear.addEventListener("click", resetFilters);
}

function resetFilters() {
  filterQuality.value = "all";
  filterSort.value = "fit";
  filterMinScore.value = "0";
  filterMinScoreValue.textContent = "0";
  filterNoEssay.checked = false;
  filterFieldMatch.checked = false;
  filterSchoolMatch.checked = false;
  filterDemographicMatch.checked = false;
  filterClosingSoon.checked = false;
  filterVerifiedOnly.checked = false;
  rerenderResults();
}

function rerenderResults() {
  if (lastResults) {
    renderResults(lastResults);
  }
}

// Field score of 40 means a specific field-of-study match (10 = open-to-all).
const SPECIFIC_FIELD_SCORE = 40;

function applyResultFilters(results) {
  const minScore = Number(filterMinScore.value) || 0;
  const quality = filterQuality.value;
  return results.filter((r) => {
    const requiresSpecialCheck = Boolean(r.requires_special_check);
    if (quality === "special" && !requiresSpecialCheck) {
      return false;
    }
    if (
      quality !== "all" &&
      quality !== "special" &&
      (r.match_tier !== quality || requiresSpecialCheck)
    ) {
      return false;
    }
    if (r.score < minScore) {
      return false;
    }
    if (filterNoEssay.checked && r.essay_required) {
      return false;
    }
    if (
      filterFieldMatch.checked &&
      (r.score_breakdown?.field_of_study ?? 0) < SPECIFIC_FIELD_SCORE
    ) {
      return false;
    }
    if (filterSchoolMatch.checked && (r.score_breakdown?.target_school ?? 0) <= 0) {
      return false;
    }
    if (filterDemographicMatch.checked && (r.score_breakdown?.demographics ?? 0) <= 0) {
      return false;
    }
    if (filterClosingSoon.checked && !r.closing_soon) {
      return false;
    }
    if (filterVerifiedOnly.checked && !r.verified) {
      return false;
    }
    return true;
  });
}

function sortResults(results) {
  const sorted = results.slice();
  switch (filterSort.value) {
    case "name":
      sorted.sort((a, b) =>
        a.scholarship_name.localeCompare(b.scholarship_name, undefined, {
          sensitivity: "base",
        })
      );
      break;
    case "award":
      sorted.sort((a, b) => awardSortValue(b.award_amount) - awardSortValue(a.award_amount));
      break;
    case "deadline":
      sorted.sort((a, b) => deadlineSortValue(a) - deadlineSortValue(b));
      break;
    default:
      // "fit": preserve the server's score/deadline/name ordering.
      break;
  }
  return sorted;
}

// Soonest real deadline first; an estimated date is used as a fallback when there
// is no confirmed deadline; rolling and unknown deadlines sort to the end.
function deadlineSortValue(result) {
  let value = result.deadline;
  if (!value || value === "rolling" || String(value).startsWith("VERIFY")) {
    value = result.estimated_deadline;
  }
  if (!value || value === "rolling" || String(value).startsWith("VERIFY")) {
    return Infinity;
  }
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? Infinity : time;
}

// Best-effort numeric value for sorting only; descriptive/VERIFY amounts sort last.
function awardSortValue(amount) {
  if (typeof amount === "number") {
    return amount;
  }
  const numbers = String(amount).match(/\d[\d,]*/g);
  if (!numbers) {
    return -1;
  }
  return Math.max(...numbers.map((n) => Number(n.replace(/,/g, ""))));
}

/* ---------- Resume auto-fill ---------- */

function wireResumeImport() {
  const importBtn = document.getElementById("resume-import-btn");
  if (importBtn) {
    importBtn.addEventListener("click", handleResumeImport);
  }
}

async function handleResumeImport() {
  const fileInput = document.getElementById("resume-file");
  const textInput = document.getElementById("resume-text");
  const loading = document.getElementById("resume-loading");
  const errorEl = document.getElementById("resume-error");
  const noteEl = document.getElementById("resume-note");
  const importBtn = document.getElementById("resume-import-btn");

  const file = fileInput.files && fileInput.files[0];
  const text = (textInput.value || "").trim();
  if (!file && !text) {
    errorEl.textContent = "Choose a PDF or paste your resume text first.";
    errorEl.hidden = false;
    return;
  }

  if (!ensureAiConsent()) {
    return;
  }

  errorEl.hidden = true;
  noteEl.hidden = true;
  loading.hidden = false;
  importBtn.disabled = true;

  try {
    const formData = new FormData();
    if (file) {
      formData.append("file", file);
    }
    if (text) {
      formData.append("text", text);
    }

    const response = await fetch("/resume/extract", { method: "POST", body: formData });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      errorEl.textContent = extractError(
        data,
        "We could not read that resume. Try pasting the text instead."
      );
      errorEl.hidden = false;
      return;
    }

    const profile = data.profile || {};
    prefillForm(profile);

    noteEl.innerHTML = "";
    const summary = summarizeExtraction(profile);
    const intro = document.createElement("p");
    intro.textContent = summary
      ? `Pre-filled ${summary}. Review everything below, then add anything missing.`
      : "We could not pull much from that resume. Fill in the form below.";
    noteEl.appendChild(intro);
    if (data.notes) {
      const detail = document.createElement("p");
      detail.className = "resume-note-detail";
      detail.textContent = data.notes;
      noteEl.appendChild(detail);
    }
    noteEl.hidden = false;
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    errorEl.textContent = "Could not reach the server. Check your connection and try again.";
    errorEl.hidden = false;
    console.error(err);
  } finally {
    loading.hidden = true;
    importBtn.disabled = false;
  }
}

function summarizeExtraction(profile) {
  const parts = [];
  if (profile.gpa !== undefined && profile.gpa !== null) parts.push("GPA");
  if (profile.grade_level) parts.push("grade level");
  if (profile.state) parts.push("state");
  if (profile.citizenship) parts.push("citizenship");
  if (profile.intended_majors && profile.intended_majors.length) parts.push("fields of study");
  if (profile.demographic_tags && profile.demographic_tags.length) parts.push("background");
  if (profile.activities && profile.activities.length) parts.push("activities");
  if (profile.target_schools && profile.target_schools.length) parts.push("target schools");
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];
}

/* ---------- Account settings ---------- */

const settingsModal = document.getElementById("settings-modal");
const SITE_CONSENT_KEY = "site_consent_v1";

function wireAgeGate() {
  const gate = document.getElementById("age-gate");
  if (!gate || localStorage.getItem(SITE_CONSENT_KEY) === "yes") {
    return;
  }
  const agree = document.getElementById("age-gate-agree");
  const cont = document.getElementById("age-gate-continue");
  agree.addEventListener("change", () => {
    cont.disabled = !agree.checked;
  });
  cont.addEventListener("click", () => {
    if (!agree.checked) {
      return;
    }
    localStorage.setItem(SITE_CONSENT_KEY, "yes");
    gate.hidden = true;
  });
  gate.hidden = false;
}

function wireSettings() {
  const openBtn = document.getElementById("open-settings");
  if (!openBtn || !settingsModal) {
    return;
  }
  openBtn.addEventListener("click", openSettingsModal);
  document.getElementById("settings-close").addEventListener("click", closeSettingsModal);
  settingsModal.addEventListener("click", (event) => {
    if (event.target === settingsModal) {
      closeSettingsModal();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !settingsModal.hidden) {
      closeSettingsModal();
    }
  });
  document
    .getElementById("change-password-form")
    .addEventListener("submit", handleChangePassword);
  document
    .getElementById("delete-account-btn")
    .addEventListener("click", handleDeleteAccount);
}

function openSettingsModal() {
  hideSettingsMessages();
  document.getElementById("change-password-form").reset();
  settingsModal.hidden = false;
  document.getElementById("current-password").focus();
}

function closeSettingsModal() {
  settingsModal.hidden = true;
  hideSettingsMessages();
}

function hideSettingsMessages() {
  const error = document.getElementById("settings-error");
  const success = document.getElementById("settings-success");
  error.hidden = true;
  error.textContent = "";
  success.hidden = true;
  success.textContent = "";
}

function showSettingsError(message) {
  const error = document.getElementById("settings-error");
  document.getElementById("settings-success").hidden = true;
  error.textContent = message;
  error.hidden = false;
}

async function handleChangePassword(event) {
  event.preventDefault();
  hideSettingsMessages();
  const current = document.getElementById("current-password").value;
  const next = document.getElementById("new-password").value;
  if (!current) {
    showSettingsError("Enter your current password.");
    return;
  }
  if (next.length < 8) {
    showSettingsError("Choose a new password with at least 8 characters.");
    return;
  }
  const submit = document.getElementById("change-password-submit");
  submit.disabled = true;
  try {
    const response = await fetch("/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_password: current, new_password: next }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      showSettingsError(extractError(data, "Could not change your password. Try again."));
      return;
    }
    const success = document.getElementById("settings-success");
    success.textContent = "Password changed.";
    success.hidden = false;
    document.getElementById("change-password-form").reset();
  } catch (err) {
    showSettingsError("Could not reach the server. Check your connection and try again.");
    console.error(err);
  } finally {
    submit.disabled = false;
  }
}

async function handleDeleteAccount() {
  hideSettingsMessages();
  const password = document.getElementById("current-password").value;
  if (!password) {
    showSettingsError("Enter your current password above to confirm deletion.");
    return;
  }
  if (
    !window.confirm(
      "Delete your account permanently? This removes your profile and saved scholarships."
    )
  ) {
    return;
  }
  try {
    const response = await fetch("/auth/delete-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      showSettingsError(extractError(data, "Could not delete your account. Try again."));
      return;
    }
    currentUser = null;
    savedIds.clear();
    savedSection.hidden = true;
    closeSettingsModal();
    renderAuthState();
    updateSavedCount();
    if (lastResults) {
      renderResults(lastResults);
    }
  } catch (err) {
    showSettingsError("Could not reach the server. Check your connection and try again.");
    console.error(err);
  }
}

/* ---------- Auth wiring ---------- */

function wireAuthControls() {
  openLoginBtn.addEventListener("click", () => openAuthModal("login"));
  openSignupBtn.addEventListener("click", () => openAuthModal("signup"));
  logoutBtn.addEventListener("click", handleLogout);
  showSavedBtn.addEventListener("click", toggleSavedView);

  authModalClose.addEventListener("click", closeAuthModal);
  authModal.addEventListener("click", (event) => {
    if (event.target === authModal) {
      closeAuthModal();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !authModal.hidden) {
      closeAuthModal();
    }
  });
  authSwitchBtn.addEventListener("click", () => {
    openAuthModal(authMode === "login" ? "signup" : "login");
  });
  authForm.addEventListener("submit", handleAuthSubmit);
}

function wirePasswordReset() {
  openPasswordResetBtn.addEventListener("click", () => openPasswordResetModal());
  passwordResetClose.addEventListener("click", closePasswordResetModal);
  passwordResetBack.addEventListener("click", () => {
    closePasswordResetModal();
    openAuthModal("login");
  });
  passwordResetModal.addEventListener("click", (event) => {
    if (event.target === passwordResetModal) {
      closePasswordResetModal();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !passwordResetModal.hidden) {
      closePasswordResetModal();
    }
  });
  passwordResetRequestForm.addEventListener("submit", handlePasswordResetRequest);
  passwordResetConfirmForm.addEventListener("submit", handlePasswordResetConfirm);

  const token = new URLSearchParams(window.location.search).get("reset_token");
  if (token) {
    openPasswordResetModal(token);
  }
}

function openAuthModal(mode, message) {
  authMode = mode;
  const isLogin = mode === "login";
  authModalTitle.textContent = isLogin ? "Log in" : "Create an account";
  authModalIntro.textContent =
    message ||
    (isLogin
      ? "Log in to save your profile and bookmark scholarships."
      : "Sign up to save your profile and bookmark scholarships.");
  authSubmit.textContent = isLogin ? "Log in" : "Create account";
  authSwitchText.textContent = isLogin ? "New here?" : "Already have an account?";
  authSwitchBtn.textContent = isLogin ? "Create an account" : "Log in";
  authPasswordHint.hidden = isLogin;
  authRecovery.hidden = !isLogin;
  authPassword.setAttribute(
    "autocomplete",
    isLogin ? "current-password" : "new-password"
  );

  hideAuthError();
  authModal.hidden = false;
  authEmail.focus();
}

function closeAuthModal() {
  authModal.hidden = true;
  authForm.reset();
  hideAuthError();
}

function openPasswordResetModal(token = null) {
  closeAuthModal();
  passwordResetToken = token;
  const confirming = Boolean(passwordResetToken);
  passwordResetTitle.textContent = confirming ? "Choose a new password" : "Reset your password";
  passwordResetIntro.textContent = confirming
    ? "Choose a new password for your Scholarships4U account."
    : "Enter your email and we'll send a one-time reset link.";
  passwordResetRequestForm.hidden = confirming;
  passwordResetConfirmForm.hidden = !confirming;
  hidePasswordResetMessages();
  passwordResetModal.hidden = false;
  (confirming ? passwordResetNewPassword : passwordResetEmail).focus();
}

function closePasswordResetModal() {
  passwordResetModal.hidden = true;
  passwordResetRequestForm.reset();
  passwordResetConfirmForm.reset();
  passwordResetToken = null;
  hidePasswordResetMessages();
  const url = new URL(window.location.href);
  if (url.searchParams.has("reset_token")) {
    url.searchParams.delete("reset_token");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }
}

function hidePasswordResetMessages() {
  passwordResetRequestError.hidden = true;
  passwordResetRequestError.textContent = "";
  passwordResetRequestSuccess.hidden = true;
  passwordResetRequestSuccess.textContent = "";
  passwordResetConfirmError.hidden = true;
  passwordResetConfirmError.textContent = "";
}

function showPasswordResetRequestError(message) {
  passwordResetRequestSuccess.hidden = true;
  passwordResetRequestError.textContent = message;
  passwordResetRequestError.hidden = false;
}

function showPasswordResetConfirmError(message) {
  passwordResetConfirmError.textContent = message;
  passwordResetConfirmError.hidden = false;
}

async function handlePasswordResetRequest(event) {
  event.preventDefault();
  hidePasswordResetMessages();
  const email = passwordResetEmail.value.trim();
  if (!email) {
    showPasswordResetRequestError("Enter your email.");
    return;
  }

  passwordResetRequestSubmit.disabled = true;
  try {
    const response = await fetch("/auth/password-reset/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      showPasswordResetRequestError(
        extractError(data, "Could not request a reset link. Please try again.")
      );
      return;
    }
    passwordResetRequestSuccess.textContent =
      data.message || "If an account exists for that email, a reset link will arrive shortly.";
    passwordResetRequestSuccess.hidden = false;
  } catch (err) {
    showPasswordResetRequestError("Could not reach the server. Check your connection and try again.");
    console.error(err);
  } finally {
    passwordResetRequestSubmit.disabled = false;
  }
}

async function handlePasswordResetConfirm(event) {
  event.preventDefault();
  passwordResetConfirmError.hidden = true;
  passwordResetConfirmError.textContent = "";
  const password = passwordResetNewPassword.value;
  const confirmation = passwordResetConfirmPassword.value;
  if (password.length < 8) {
    showPasswordResetConfirmError("Choose a password with at least 8 characters.");
    return;
  }
  if (password !== confirmation) {
    showPasswordResetConfirmError("Those passwords do not match.");
    return;
  }

  passwordResetConfirmSubmit.disabled = true;
  try {
    const response = await fetch("/auth/password-reset/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: passwordResetToken, new_password: password }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      showPasswordResetConfirmError(
        extractError(data, "Could not reset your password. Request a new link and try again.")
      );
      return;
    }
    closePasswordResetModal();
    await loadSession();
  } catch (err) {
    showPasswordResetConfirmError("Could not reach the server. Check your connection and try again.");
    console.error(err);
  } finally {
    passwordResetConfirmSubmit.disabled = false;
  }
}

function showAuthError(message) {
  authError.textContent = message;
  authError.hidden = false;
}

function hideAuthError() {
  authError.hidden = true;
  authError.textContent = "";
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  hideAuthError();

  const email = authEmail.value.trim();
  const password = authPassword.value;

  if (!email) {
    showAuthError("Enter your email.");
    return;
  }
  if (authMode === "signup" && password.length < 8) {
    showAuthError("Choose a password with at least 8 characters.");
    return;
  }
  if (!password) {
    showAuthError("Enter your password.");
    return;
  }

  const endpoint = authMode === "login" ? "/auth/login" : "/auth/signup";
  authSubmit.disabled = true;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      showAuthError(extractError(data, "That did not work. Check your details and try again."));
      return;
    }

    currentUser = data;
    closeAuthModal();
    renderAuthState();
    await Promise.all([loadProfileIntoForm(), loadSaved()]);
    if (lastResults) {
      renderResults(lastResults);
    }
  } catch (err) {
    showAuthError("Could not reach the server. Check your connection and try again.");
    console.error(err);
  } finally {
    authSubmit.disabled = false;
  }
}

async function handleLogout() {
  try {
    await fetch("/auth/logout", { method: "POST" });
  } catch (err) {
    console.error(err);
  }
  currentUser = null;
  savedIds.clear();
  savedSection.hidden = true;
  renderAuthState();
  updateSavedCount();
  if (lastResults) {
    renderResults(lastResults);
  }
}

async function loadSession() {
  try {
    const response = await fetch("/auth/me");
    if (response.ok) {
      currentUser = await response.json();
      renderAuthState();
      await Promise.all([loadProfileIntoForm(), loadSaved()]);
    } else {
      currentUser = null;
      renderAuthState();
    }
  } catch (err) {
    currentUser = null;
    renderAuthState();
    console.error(err);
  }
}

function renderAuthState() {
  const loggedIn = currentUser !== null;
  authLoggedIn.hidden = !loggedIn;
  authLoggedOut.hidden = loggedIn;
  if (loggedIn) {
    accountEmail.textContent = currentUser.email;
    accountEmail.title = currentUser.email;
  }
  updateSavedCount();
}

/* ---------- Profile persistence ---------- */

async function loadProfileIntoForm() {
  if (!currentUser) {
    return;
  }
  try {
    const response = await fetch("/account/profile");
    if (!response.ok) {
      return;
    }
    const data = await response.json();
    if (data.profile) {
      prefillForm(data.profile);
      lastSubmittedProfile = data.profile;
    }
  } catch (err) {
    console.error(err);
  }
}

function prefillForm(profile) {
  setValue("gpa", profile.gpa);
  setValue("grade-level", profile.grade_level);
  setValue("citizenship", profile.citizenship);
  setValue("state", profile.state);
  setValue("financial-need", profile.financial_need_level);
  setCheckboxes("fields-of-study", profile.intended_majors || []);
  setCheckboxes("demographic-tags", profile.demographic_tags || []);
  setValue("target-schools", (profile.target_schools || []).join(", "));
  setValue("activities", (profile.activities || []).join(", "));
  updateProfileProgress();
}

function setValue(elementId, value) {
  const el = document.getElementById(elementId);
  if (el && value !== undefined && value !== null) {
    if (el.tagName === "SELECT") {
      ensureSelectValue(el, value, elementId);
    }
    el.value = value;
  }
}

function ensureSelectValue(select, value, elementId) {
  if (!value || Array.from(select.options).some((option) => option.value === value)) {
    return;
  }
  if (elementId !== "grade-level" || !LEGACY_GRADE_LABELS[value]) {
    return;
  }
  const option = document.createElement("option");
  option.value = value;
  option.textContent = LEGACY_GRADE_LABELS[value];
  option.title = "This broad saved value is still accepted, but choosing your exact class year will return better matches.";
  select.appendChild(option);
}

function setCheckboxes(containerId, values) {
  const wanted = new Set(values);
  const container = document.getElementById(containerId);
  if (!container) {
    return;
  }
  for (const input of container.querySelectorAll("input[type=checkbox]")) {
    input.checked = wanted.has(input.value);
  }
}

async function saveProfileSilently(profile) {
  if (!currentUser) {
    return;
  }
  try {
    await fetch("/account/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });
  } catch (err) {
    console.error(err);
  }
}

/* ---------- Saved scholarships ---------- */

async function loadSaved() {
  if (!currentUser) {
    return;
  }
  try {
    const response = await fetch("/account/saved");
    if (!response.ok) {
      return;
    }
    const data = await response.json();
    savedIds.clear();
    for (const item of data.saved) {
      savedIds.add(item.scholarship_id);
    }
    updateSavedCount();
    if (!savedSection.hidden) {
      renderSaved(data.saved);
    }
  } catch (err) {
    console.error(err);
  }
}

function updateSavedCount() {
  const count = savedIds.size;
  savedCountEl.textContent = String(count);
  savedCountEl.hidden = count === 0;
}

async function toggleSavedView() {
  if (savedSection.hidden) {
    await showSavedView();
  } else {
    savedSection.hidden = true;
  }
}

async function showSavedView() {
  savedSection.hidden = false;
  savedContainer.innerHTML = "";
  savedSummary.textContent = "Loading...";
  try {
    const response = await fetch("/account/saved");
    if (!response.ok) {
      savedSummary.textContent = "Saved scholarships could not be loaded.";
      return;
    }
    const data = await response.json();
    savedIds.clear();
    for (const item of data.saved) {
      savedIds.add(item.scholarship_id);
    }
    updateSavedCount();
    renderSaved(data.saved);
  } catch (err) {
    savedSummary.textContent = "Saved scholarships could not be loaded.";
    console.error(err);
  }
  savedSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

const SAVED_STATUSES = [
  { value: "interested", label: "Interested" },
  { value: "drafting", label: "Drafting" },
  { value: "submitted", label: "Submitted" },
  { value: "awarded", label: "Awarded" },
  { value: "rejected", label: "Rejected" },
];
let trackerItems = [];

function trackerSummary(items) {
  const counts = {};
  for (const item of items) {
    const status = item.status || "interested";
    counts[status] = (counts[status] || 0) + 1;
  }
  const parts = SAVED_STATUSES.filter((s) => counts[s.value]).map(
    (s) => `${counts[s.value]} ${s.label.toLowerCase()}`
  );
  const total = items.length;
  const head = `${total} saved scholarship${total === 1 ? "" : "s"}`;
  const totalSteps = items.reduce(
    (sum, item) => sum + (item.scholarship?.application_requirements?.length || 0),
    0
  );
  const completedSteps = items.reduce(
    (sum, item) => sum + (item.completed_requirement_ids?.length || 0),
    0
  );
  if (totalSteps) {
    const statusSummary = parts.length ? `${head} — ${parts.join(", ")}.` : `${head}.`;
    return `${statusSummary} ${completedSteps}/${totalSteps} application steps complete.`;
  }
  return parts.length ? `${head} — ${parts.join(", ")}.` : `${head}.`;
}

function refreshTrackerSummary() {
  if (trackerItems.length > 0) {
    savedSummary.textContent = trackerSummary(trackerItems);
  }
}

function renderSaved(items) {
  trackerItems = items || [];
  savedContainer.innerHTML = "";
  if (!items || items.length === 0) {
    savedSummary.textContent = "";
    savedEmpty.hidden = false;
    return;
  }
  savedEmpty.hidden = true;
  savedSummary.textContent = trackerSummary(items);

  for (const item of items) {
    if (!item.scholarship) {
      continue;
    }
    // A saved item is part of the application tracker, not a fresh match for
    // the current profile. Give it neutral tracker styling instead of claiming
    // it is a strong match.
    const card = buildCard(scholarshipToCard(item.scholarship), "saved");
    card.classList.add(`status-${item.status || "interested"}`);
    // Append inside the card-body (the wide grid column), not the card grid
    // itself, or the controls land in the narrow path-bar column.
    const cardBody = card.querySelector(".card-body");
    (cardBody || card).appendChild(buildTrackerControls(item, card));
    savedContainer.appendChild(card);
  }
}

function buildTrackerControls(item, card) {
  const wrap = document.createElement("div");
  wrap.className = "tracker-controls";

  const checklist = buildApplicationChecklist(item);
  if (checklist) {
    wrap.appendChild(checklist);
  }

  const statusField = document.createElement("div");
  statusField.className = "tracker-field";
  const statusLabelEl = document.createElement("span");
  statusLabelEl.className = "tracker-label";
  statusLabelEl.textContent = "Status";
  const select = document.createElement("select");
  select.className = "tracker-status";
  for (const opt of SAVED_STATUSES) {
    const option = document.createElement("option");
    option.value = opt.value;
    option.textContent = opt.label;
    if ((item.status || "interested") === opt.value) {
      option.selected = true;
    }
    select.appendChild(option);
  }
  select.addEventListener("change", async () => {
    const ok = await patchSaved(item.scholarship_id, { status: select.value });
    if (ok) {
      item.status = select.value;
      card.className = card.className.replace(/\bstatus-\w+\b/, `status-${select.value}`);
      refreshTrackerSummary();
    }
  });
  statusField.appendChild(statusLabelEl);
  statusField.appendChild(select);

  const notesField = document.createElement("div");
  notesField.className = "tracker-field tracker-field-notes";
  const notesLabelEl = document.createElement("span");
  notesLabelEl.className = "tracker-label";
  notesLabelEl.textContent = "Notes";
  const notes = document.createElement("textarea");
  notes.className = "tracker-notes";
  notes.rows = 2;
  notes.maxLength = 2000;
  notes.value = item.notes || "";
  notes.placeholder = "Deadlines, requirements, where you left off...";
  let lastSaved = item.notes || "";
  notes.addEventListener("blur", () => {
    if (notes.value !== lastSaved) {
      lastSaved = notes.value;
      patchSaved(item.scholarship_id, { notes: notes.value });
    }
  });
  notesField.appendChild(notesLabelEl);
  notesField.appendChild(notes);

  wrap.appendChild(statusField);
  wrap.appendChild(notesField);
  return wrap;
}

function buildApplicationChecklist(item) {
  const requirements = item.scholarship?.application_requirements || [];
  if (!requirements.length) {
    return null;
  }

  const field = document.createElement("div");
  field.className = "tracker-field tracker-checklist";
  const header = document.createElement("div");
  header.className = "tracker-checklist-header";
  const label = document.createElement("span");
  label.className = "tracker-label";
  label.textContent = "Application checklist";
  const progress = document.createElement("span");
  progress.className = "tracker-checklist-progress";
  header.appendChild(label);
  header.appendChild(progress);
  field.appendChild(header);
  const nextAction = document.createElement("span");
  nextAction.className = "tracker-checklist-next";
  field.appendChild(nextAction);

  const requirementIds = new Set(requirements.map((requirement) => requirement.id));
  let completed = new Set(
    (item.completed_requirement_ids || []).filter((requirementId) => requirementIds.has(requirementId))
  );
  const updateProgress = () => {
    progress.textContent = `${completed.size}/${requirements.length} complete`;
    const nextRequired = requirements.find(
      (requirement) => requirement.required !== false && !completed.has(requirement.id)
    );
    const nextAny = requirements.find((requirement) => !completed.has(requirement.id));
    if (nextRequired) {
      nextAction.textContent = `Next: ${nextRequired.label}`;
    } else if (nextAny) {
      nextAction.textContent = `Optional next: ${nextAny.label}`;
    } else {
      nextAction.textContent = "All verified steps complete";
    }
  };
  updateProgress();

  for (const requirement of requirements) {
    const task = document.createElement("label");
    task.className = "tracker-task";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = completed.has(requirement.id);
    const copy = document.createElement("span");
    copy.className = "tracker-task-copy";
    const title = document.createElement("strong");
    title.textContent = requirement.label;
    copy.appendChild(title);
    if (requirement.required === false) {
      const optional = document.createElement("span");
      optional.className = "tracker-task-optional";
      optional.textContent = "Optional";
      copy.appendChild(optional);
    }
    if (requirement.details) {
      const details = document.createElement("span");
      details.className = "tracker-task-details";
      details.textContent = requirement.details;
      copy.appendChild(details);
    }
    if (requirement.source_url) {
      const source = document.createElement("a");
      source.href = requirement.source_url;
      source.target = "_blank";
      source.rel = "noopener noreferrer";
      source.textContent = "Source";
      source.addEventListener("click", (event) => event.stopPropagation());
      copy.appendChild(source);
    }
    task.appendChild(checkbox);
    task.appendChild(copy);
    checkbox.addEventListener("change", async () => {
      const before = new Set(completed);
      if (checkbox.checked) {
        completed.add(requirement.id);
      } else {
        completed.delete(requirement.id);
      }
      checkbox.disabled = true;
      updateProgress();
      const ok = await patchSaved(item.scholarship_id, {
        completed_requirement_ids: Array.from(completed),
      });
      checkbox.disabled = false;
      if (!ok) {
        completed = before;
        checkbox.checked = completed.has(requirement.id);
        updateProgress();
        return;
      }
      item.completed_requirement_ids = Array.from(completed);
      refreshTrackerSummary();
    });
    field.appendChild(task);
  }
  return field;
}

async function patchSaved(scholarshipId, payload) {
  try {
    const response = await fetch(`/account/saved/${encodeURIComponent(scholarshipId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return response.ok;
  } catch (err) {
    console.error(err);
    return false;
  }
}

async function toggleSaved(scholarshipId, button) {
  if (!currentUser) {
    openAuthModal("login", "Log in to save scholarships to your account.");
    return;
  }

  const isSaved = savedIds.has(scholarshipId);
  button.disabled = true;
  try {
    if (isSaved) {
      const response = await fetch(`/account/saved/${encodeURIComponent(scholarshipId)}`, {
        method: "DELETE",
      });
      if (response.ok) {
        savedIds.delete(scholarshipId);
      }
    } else {
      const response = await fetch(`/account/saved/${encodeURIComponent(scholarshipId)}`, {
        method: "POST",
      });
      if (response.ok) {
        savedIds.add(scholarshipId);
      }
    }
    applySavedButtonState(button, savedIds.has(scholarshipId));
    updateSavedCount();
    if (!savedSection.hidden) {
      const refreshed = await fetch("/account/saved").then((r) => r.json());
      renderSaved(refreshed.saved);
    }
  } catch (err) {
    console.error(err);
  } finally {
    button.disabled = false;
  }
}

function applySavedButtonState(button, isSaved) {
  button.classList.toggle("is-saved", isSaved);
  button.textContent = isSaved ? "Saved" : "Save";
}

/* ---------- Form population (existing) ---------- */

function populateForm(vocab) {
  fillSelect("grade-level", vocab.grade_level);
  fillSelect("citizenship", vocab.citizenship);
  fillSelect("state", vocab.state);
  fillSelect("financial-need", vocab.financial_need_level);
  fillCheckboxes("fields-of-study", vocab.fields_of_study, "fields");
  fillCheckboxes("demographic-tags", vocab.demographic_tags, "demographics");
  applyProfileHelp();
}

function fillSelect(elementId, options) {
  const select = document.getElementById(elementId);
  const placeholderText = select.options[0]?.textContent || "Select...";
  select.replaceChildren();

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = placeholderText;
  select.appendChild(placeholder);

  for (const opt of options) {
    const option = document.createElement("option");
    option.value = opt.value;
    option.textContent = opt.label;
    const helpText = selectOptionHelp(elementId, opt);
    if (helpText) {
      option.title = helpText;
    }
    select.appendChild(option);
  }
}

function fillCheckboxes(containerId, options, namePrefix) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";
  for (const opt of options) {
    const label = document.createElement("label");
    label.className = "checkbox-item";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = namePrefix;
    input.value = opt.value;

    const helpText = checkboxOptionHelp(namePrefix, opt);
    if (helpText) {
      label.classList.add("has-tooltip", "option-tooltip");
      label.dataset.tooltip = helpText;
    }

    label.appendChild(input);
    label.appendChild(document.createTextNode(opt.label));
    container.appendChild(label);
  }
}

function applyProfileHelp() {
  for (const [id, helpText] of Object.entries(CRITERIA_HELP)) {
    const element = document.getElementById(id);
    const target = element?.closest(".field") || element;
    addTooltip(target, helpText);
  }
}

function addTooltip(target, helpText) {
  if (!target || !helpText) {
    return;
  }
  const label = target.querySelector("label, legend");
  const tooltipTarget = label || target;
  tooltipTarget.classList.add("has-tooltip");
  tooltipTarget.dataset.tooltip = helpText;

  if (label && !label.querySelector(".help-dot")) {
    const dot = document.createElement("span");
    dot.className = "help-dot";
    dot.textContent = "?";
    dot.title = helpText;
    dot.setAttribute("aria-hidden", "true");
    label.appendChild(dot);
  }
}

function checkboxOptionHelp(namePrefix, option) {
  if (namePrefix === "fields") {
    return `${option.label} creates field-fit points only when a scholarship lists this area or a broader approved parent area. Narrow requirements like computer science need that exact field selected.`;
  }
  if (namePrefix === "demographics") {
    return `${option.label} is used only as a positive signal for scholarships that mention this group. It never hides scholarships from you.`;
  }
  return "";
}

function selectOptionHelp(elementId, option) {
  if (elementId === "financial-need") {
    return `${option.label} financial need affects ranking only for scholarships that publish a need-based preference or requirement.`;
  }
  if (elementId === "grade-level") {
    return `${option.label} is used to screen out awards limited to other school levels. Broad sponsor rules are matched automatically.`;
  }
  if (elementId === "citizenship") {
    return `${option.label} is compared with published citizenship rules when those rules are verified.`;
  }
  if (elementId === "state") {
    return `${option.label} is compared with state-specific eligibility when a scholarship is not national.`;
  }
  return "";
}

function parseCommaList(value) {
  if (!value || !value.trim()) {
    return null;
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function getCheckedValues(containerId) {
  const container = document.getElementById(containerId);
  return Array.from(container.querySelectorAll("input:checked")).map(
    (input) => input.value
  );
}

function buildProfile() {
  const gpa = parseFloat(document.getElementById("gpa").value);
  const gradeLevel = document.getElementById("grade-level").value;
  const citizenship = document.getElementById("citizenship").value;
  const state = document.getElementById("state").value;
  const financialNeed = document.getElementById("financial-need").value;
  const intendedMajors = getCheckedValues("fields-of-study");
  const demographicTags = getCheckedValues("demographic-tags");
  const targetSchools = parseCommaList(
    document.getElementById("target-schools").value
  );
  const activities = parseCommaList(document.getElementById("activities").value);

  if (Number.isNaN(gpa)) {
    return { error: "Enter a GPA between 0.0 and 4.0." };
  }
  if (!gradeLevel) {
    return { error: "Select your grade level." };
  }
  if (!citizenship) {
    return { error: "Select your citizenship status." };
  }
  if (!state) {
    return { error: "Select your state." };
  }
  if (!financialNeed) {
    return { error: "Select a financial need level." };
  }
  if (intendedMajors.length === 0) {
    return { error: "Select at least one field of study." };
  }

  const profile = {
    gpa,
    grade_level: gradeLevel,
    citizenship,
    state,
    financial_need_level: financialNeed,
    intended_majors: intendedMajors,
    demographic_tags: demographicTags,
    activities: activities || [],
  };

  if (targetSchools) {
    profile.target_schools = targetSchools;
  }

  return { profile };
}

function formatValidationErrors(detail) {
  if (!Array.isArray(detail)) {
    return "The profile could not be submitted. Check your entries and try again.";
  }

  const messages = detail.map((item) => {
    const field = item.loc ? item.loc[item.loc.length - 1] : "field";
    const label = fieldLabel(String(field));
    return `${label}: ${item.msg}`;
  });

  return messages.join(" ");
}

function fieldLabel(field) {
  const labels = {
    gpa: "GPA",
    grade_level: "Grade level",
    citizenship: "Citizenship",
    state: "State",
    financial_need_level: "Financial need level",
    intended_majors: "Fields of study",
    demographic_tags: "Demographic tags",
    target_schools: "Target schools",
    activities: "Activities",
  };
  return labels[field] || field.replace(/_/g, " ");
}

function extractError(data, fallback) {
  if (!data) {
    return fallback;
  }
  if (data.detail) {
    if (typeof data.detail === "string") {
      return data.detail;
    }
    if (data.detail.error) {
      return data.detail.error;
    }
    if (Array.isArray(data.detail)) {
      return formatValidationErrors(data.detail);
    }
  }
  return fallback;
}

function showFormError(message) {
  formError.textContent = message;
  formError.hidden = false;
}

function hideFormError() {
  formError.hidden = true;
  formError.textContent = "";
}

function setLoading(isLoading) {
  loadingEl.hidden = !isLoading;
  submitBtn.disabled = isLoading;
  if (isLoading) {
    resultsContainer.innerHTML = "";
    resultsEmpty.hidden = true;
    resultsFilters.hidden = true;
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  hideFormError();

  const built = buildProfile();
  if (built.error) {
    showFormError(built.error);
    return;
  }

  resultsSection.hidden = false;
  setLoading(true);

  try {
    const response = await fetch("/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(built.profile),
    });

    if (response.status === 422) {
      const data = await response.json();
      showFormError(formatValidationErrors(data.detail));
      setLoading(false);
      return;
    }

    if (!response.ok) {
      throw new Error(`Match request failed (${response.status})`);
    }

    const results = await response.json();
    lastSubmittedProfile = built.profile;
    lastResults = results;
    renderResults(results);
    saveProfileSilently(built.profile);
    loadPrograms(built.profile);
  } catch (err) {
    showFormError(
      "The match request did not go through. Check your connection and try again."
    );
    console.error(err);
  } finally {
    setLoading(false);
  }
}

function renderResults(results) {
  resultsContainer.innerHTML = "";

  if (results.length === 0) {
    resultsSummary.textContent = "";
    resultsFilters.hidden = true;
    resultsEmpty.hidden = false;
    return;
  }

  resultsFilters.hidden = false;

  const filtered = sortResults(applyResultFilters(results));

  if (filtered.length === 0) {
    resultsEmpty.hidden = true;
    resultsSummary.textContent = `0 of ${results.length} matches shown with the current filters.`;
    const note = document.createElement("div");
    note.className = "results-empty panel";
    note.innerHTML =
      "<h3>No matches with these filters</h3><p>Loosen a filter or use <strong>Clear filters</strong> to see all matches again.</p>";
    resultsContainer.appendChild(note);
    return;
  }

  resultsEmpty.hidden = true;
  const regular = filtered.filter((r) => !r.requires_special_check);
  const special = filtered.filter((r) => r.requires_special_check);
  const strong = regular.filter((r) => r.match_tier === "strong");
  const possible = regular.filter((r) => r.match_tier === "possible");

  const shownAll = filtered.length === results.length;
  resultsSummary.textContent = shownAll
    ? `${results.length} scholarship${results.length === 1 ? "" : "s"} matched your profile.`
    : `Showing ${filtered.length} of ${results.length} matched scholarships.`;

  if (strong.length > 0) {
    resultsContainer.appendChild(buildTierSection("Strong matches", strong, "strong"));
  }
  if (possible.length > 0) {
    resultsContainer.appendChild(
      buildTierSection("Possible matches", possible, "possible")
    );
  }
  if (special.length > 0) {
    resultsContainer.appendChild(
      buildTierSection(
        "Special opportunities to check",
        special,
        "special",
        "These may be worthwhile, but they require a niche condition like a nomination, membership, finalist status, or affiliation that this profile cannot verify yet."
      )
    );
  }
}

function buildTierSection(title, matches, tierClass, description = "") {
  const section = document.createElement("div");
  section.className = "tier-section";

  const heading = document.createElement("h3");
  heading.className = `tier-heading ${
    tierClass === "possible" || tierClass === "special" ? tierClass : ""
  }`;
  heading.innerHTML = `${escapeHtml(title)} <span class="tier-count">${matches.length}</span>`;
  section.appendChild(heading);

  if (description) {
    const note = document.createElement("p");
    note.className = "tier-note";
    note.textContent = description;
    section.appendChild(note);
  }

  for (const [index, match] of matches.entries()) {
    const card = buildCard(matchToCard(match), tierClass);
    card.classList.add("match-card-enter");
    card.style.setProperty("--card-delay", `${Math.min(index * 42, 252)}ms`);
    section.appendChild(card);
  }

  return section;
}

/* ---------- Summer programs ---------- */

async function loadPrograms(profile) {
  try {
    const response = await fetch("/programs/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });
    if (!response.ok) {
      programsSection.hidden = true;
      return;
    }
    const programs = await response.json();
    if (!programs.length) {
      programsSection.hidden = true;
      return;
    }
    programsSection.hidden = false;
    renderPrograms(programs);
  } catch (err) {
    programsSection.hidden = true;
    console.error(err);
  }
}

function renderPrograms(programs) {
  programsContainer.innerHTML = "";
  programsEmpty.hidden = true;

  const regular = programs.filter((p) => !p.requires_special_check);
  const special = programs.filter((p) => p.requires_special_check);
  const strong = regular.filter((p) => p.match_tier === "strong");
  const possible = regular.filter((p) => p.match_tier === "possible");
  programsSummary.textContent = `${programs.length} program${
    programs.length === 1 ? "" : "s"
  } matched your profile.`;

  if (strong.length > 0) {
    programsContainer.appendChild(buildProgramTierSection("Strong fits", strong, "strong"));
  }
  if (possible.length > 0) {
    programsContainer.appendChild(
      buildProgramTierSection("Possible fits", possible, "possible")
    );
  }
  if (special.length > 0) {
    programsContainer.appendChild(
      buildProgramTierSection(
        "Special programs to check",
        special,
        "special",
        "These programs may fit, but they require a condition like school nomination, a special application channel, or another gate this profile cannot verify yet."
      )
    );
  }
}

function buildProgramTierSection(title, programs, tierClass, description = "") {
  const section = document.createElement("div");
  section.className = "tier-section";

  const heading = document.createElement("h3");
  heading.className = `tier-heading ${
    tierClass === "possible" || tierClass === "special" ? tierClass : ""
  }`;
  heading.innerHTML = `${escapeHtml(title)} <span class="tier-count">${programs.length}</span>`;
  section.appendChild(heading);

  if (description) {
    const note = document.createElement("p");
    note.className = "tier-note";
    note.textContent = description;
    section.appendChild(note);
  }

  programs.forEach((program, index) => {
    const card = buildProgramCard(program);
    card.classList.add("match-card-enter");
    card.style.setProperty("--card-delay", `${Math.min(index * 42, 252)}ms`);
    section.appendChild(card);
  });

  return section;
}

function programStatValue(value) {
  if (!value || value === "VERIFY" || String(value).startsWith("VERIFY")) {
    return "Not listed";
  }
  return value;
}

function buildProgramStatRow(program) {
  const row = document.createElement("div");
  row.className = "card-stats";

  const cost = document.createElement("div");
  cost.className = "stat";
  if (program.cost_category === "free" || program.cost_category === "stipend") {
    cost.classList.add("stat-award");
  }
  cost.innerHTML =
    '<span class="stat-label">Cost</span>' +
    `<span class="stat-value">${escapeHtml(programStatValue(program.cost))}</span>`;
  row.appendChild(cost);

  const selectivity = document.createElement("div");
  selectivity.className = "stat";
  selectivity.innerHTML =
    '<span class="stat-label">Selectivity</span>' +
    `<span class="stat-value">${escapeHtml(programStatValue(program.selectivity))}</span>`;
  row.appendChild(selectivity);

  const dates = document.createElement("div");
  dates.className = "stat";
  dates.innerHTML =
    '<span class="stat-label">Dates</span>' +
    `<span class="stat-value">${escapeHtml(programStatValue(program.program_dates))}</span>`;
  row.appendChild(dates);

  const dl = deadlineParts(program.deadline, program.estimated_deadline);
  const apply = document.createElement("div");
  apply.className = "stat stat-deadline";
  apply.innerHTML =
    '<span class="stat-label">Apply by</span>' +
    `<span class="stat-value">${escapeHtml(dl.value)}</span>` +
    (dl.note ? `<span class="stat-note">${escapeHtml(dl.note)}</span>` : "");
  row.appendChild(apply);

  return row;
}

function buildProgramSteps(steps) {
  const wrap = document.createElement("div");
  wrap.className = "reasons program-steps";

  const heading = document.createElement("p");
  heading.className = "reasons-heading";
  heading.textContent = "Application steps";
  wrap.appendChild(heading);

  const list = document.createElement("ul");
  list.className = "reason-list";
  for (const step of steps) {
    const li = document.createElement("li");
    const title = document.createElement("strong");
    title.textContent = step.label;
    li.appendChild(title);
    if (step.details) {
      const details = document.createElement("span");
      details.className = "tracker-task-details";
      details.textContent = ` ${step.details}`;
      li.appendChild(details);
    }
    if (step.source_url) {
      li.appendChild(document.createTextNode(" "));
      const source = document.createElement("a");
      source.href = step.source_url;
      source.target = "_blank";
      source.rel = "noopener noreferrer";
      source.textContent = "Source";
      li.appendChild(source);
    }
    list.appendChild(li);
  }
  wrap.appendChild(list);
  return wrap;
}

function buildProgramCard(program) {
  const tierClass = program.requires_special_check
    ? "special"
    : program.match_tier === "possible"
    ? "possible"
    : "strong";
  const article = document.createElement("article");
  article.className = `match-card ${tierClass}`;

  const pathBar = document.createElement("div");
  pathBar.className = "path-bar";
  pathBar.setAttribute("aria-hidden", "true");

  const body = document.createElement("div");
  body.className = "card-body";

  const header = document.createElement("div");
  header.className = "card-header";
  const headline = document.createElement("div");
  headline.className = "card-headline";

  const title = document.createElement("h4");
  title.className = "card-title";
  title.textContent = program.name;
  headline.appendChild(title);

  if (program.host) {
    const host = document.createElement("p");
    host.className = "card-sponsor";
    host.textContent = program.host;
    headline.appendChild(host);
  }

  const formatLabel =
    program.program_format && !String(program.program_format).startsWith("VERIFY")
      ? program.program_format.charAt(0).toUpperCase() + program.program_format.slice(1)
      : null;
  const metaParts = [program.subject, formatLabel, program.location].filter(
    (part) => part && part !== "VERIFY" && !String(part).startsWith("VERIFY")
  );
  if (metaParts.length > 0) {
    const meta = document.createElement("p");
    meta.className = "card-program-meta";
    meta.textContent = metaParts.join(" · ");
    headline.appendChild(meta);
  }
  header.appendChild(headline);

  if (typeof program.score === "number") {
    header.appendChild(buildFitRing(program.score, tierClass));
  }

  body.appendChild(header);
  body.appendChild(buildProgramStatRow(program));

  const provenance = buildVerificationSource(program);
  if (provenance) {
    body.appendChild(provenance);
  }

  if (program.match_reasons && program.match_reasons.length > 0) {
    body.appendChild(buildReasons(program.match_reasons));
  }

  if (program.requires_special_check) {
    const badges = document.createElement("div");
    badges.className = "badge-row";
    badges.appendChild(makeBadge("Special eligibility", "badge-special"));
    body.appendChild(badges);
  }

  if (program.special_requirements && program.special_requirements.length > 0) {
    body.appendChild(buildSpecialRequirements(program.special_requirements));
  }

  const steps = program.application_requirements || [];
  if (steps.length > 0) {
    body.appendChild(buildProgramSteps(steps));
  }

  const footer = document.createElement("div");
  footer.className = "card-footer";
  const link = document.createElement("a");
  link.className = "card-link";
  link.href = program.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = program.requires_special_check ? "Check program page" : "View program";
  footer.appendChild(link);
  body.appendChild(footer);

  article.appendChild(pathBar);
  article.appendChild(body);
  return article;
}

function matchToCard(match) {
  return {
    scholarship_id: match.scholarship_id,
    name: match.scholarship_name,
    sponsor: match.sponsor,
    award_amount: match.award_amount,
    deadline: match.deadline,
    estimated_deadline: match.estimated_deadline,
    url: match.url,
    verified: match.verified,
    verification_source_url: match.verification_source_url,
    last_verified_at: match.last_verified_at,
    closing_soon: match.closing_soon,
    score: match.score,
    score_breakdown: match.score_breakdown,
    eligible_schools: match.eligible_schools || [],
    requires_special_check: Boolean(match.requires_special_check),
    special_requirements: match.special_requirements || [],
    match_reasons: match.match_reasons || [],
  };
}

function scholarshipToCard(scholarship) {
  return {
    scholarship_id: scholarship.id,
    name: scholarship.name,
    sponsor: scholarship.sponsor,
    award_amount: scholarship.award_amount,
    deadline: scholarship.deadline,
    estimated_deadline: scholarship.estimated_deadline,
    url: scholarship.url,
    verified: scholarship.verified,
    verification_source_url: scholarship.verification?.source_url || null,
    last_verified_at: scholarship.verification?.last_verified_at || null,
    closing_soon: computeClosingSoon(scholarship.deadline),
    eligible_schools: (scholarship.eligibility?.eligible_schools || []).map((s) => s.name),
    requires_special_check: Boolean(scholarship.eligibility?.special_requirements?.length),
    special_requirements: scholarship.eligibility?.special_requirements || [],
    score: null,
    match_reasons: [],
  };
}

function computeClosingSoon(deadline) {
  if (!deadline || deadline === "rolling" || String(deadline).startsWith("VERIFY")) {
    return false;
  }
  const target = new Date(deadline);
  if (Number.isNaN(target.getTime())) {
    return false;
  }
  const diffDays = (target - new Date()) / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays <= 30;
}

// Turns raw enum tokens that leak into reason strings (e.g. "high_school_senior")
// into readable text without disturbing the rest of the sentence.
function humanizeReason(text) {
  return String(text).replace(/[a-z0-9]+(?:_[a-z0-9]+)+/gi, (token) => token.replace(/_/g, " "));
}

function deadlineParts(deadline, estimated) {
  if (deadline === "rolling") {
    return { value: "Rolling", note: "Applications accepted anytime" };
  }
  if (!deadline || deadline === "VERIFY" || String(deadline).startsWith("VERIFY")) {
    if (estimated) {
      return { value: formatVerifiedDate(estimated), note: "Estimated \u2014 confirm on sponsor site" };
    }
    return { value: "Not listed", note: "Confirm on sponsor site" };
  }
  return { value: formatVerifiedDate(deadline), note: "" };
}

// Circular fit gauge: gives every match a single, scannable anchor and fills
// the horizontal space the old flat layout left empty.
function buildFitRing(score, tierClass) {
  const pct = Math.max(0, Math.min(100, Math.round(score)));
  const r = 26;
  const circ = Number((2 * Math.PI * r).toFixed(2));
  const dash = Number(((pct / 100) * circ).toFixed(2));
  const label =
    tierClass === "special"
      ? "Check eligibility"
      : tierClass === "possible"
      ? "Possible fit"
      : "Strong fit";

  const wrap = document.createElement("div");
  wrap.className = "fit-ring";
  wrap.setAttribute("role", "img");
  wrap.setAttribute("aria-label", `Fit score ${pct} out of 100 \u2014 ${label}`);
  wrap.innerHTML =
    '<div class="fit-ring-dial">' +
    '<svg class="fit-ring-svg" viewBox="0 0 64 64" aria-hidden="true">' +
    `<circle class="fit-ring-track" cx="32" cy="32" r="${r}"></circle>` +
    `<circle class="fit-ring-value" cx="32" cy="32" r="${r}" transform="rotate(-90 32 32)" style="--circ:${circ};--dash:${dash}"></circle>` +
    "</svg>" +
    '<div class="fit-ring-num"><strong>0</strong><span>fit</span></div>' +
    "</div>" +
    `<span class="fit-ring-label">${label}</span>`;

  const numEl = wrap.querySelector(".fit-ring-num strong");
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    numEl.textContent = String(pct);
  } else {
    const start = performance.now();
    const duration = 850;
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      numEl.textContent = String(Math.round(eased * pct));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  return wrap;
}

function buildStatRow(card) {
  const row = document.createElement("div");
  row.className = "card-stats";

  const award = document.createElement("div");
  award.className = "stat stat-award";
  award.innerHTML =
    '<span class="stat-label">Award</span>' +
    `<span class="stat-value">${escapeHtml(formatAward(card.award_amount))}</span>`;
  row.appendChild(award);

  const dl = deadlineParts(card.deadline, card.estimated_deadline);
  const deadline = document.createElement("div");
  deadline.className = "stat stat-deadline";
  if (card.closing_soon) {
    deadline.classList.add("stat-urgent");
    if (!dl.note) dl.note = "Closing soon";
  }
  deadline.innerHTML =
    '<span class="stat-label">Deadline</span>' +
    `<span class="stat-value">${escapeHtml(dl.value)}</span>` +
    (dl.note ? `<span class="stat-note">${escapeHtml(dl.note)}</span>` : "");
  row.appendChild(deadline);

  return row;
}

// Humanized, scannable reasons. Long lists collapse to the top few with a
// toggle so the card stays calm instead of dumping a wall of bullets.
function buildReasons(reasons) {
  const wrap = document.createElement("div");
  wrap.className = "reasons";

  const heading = document.createElement("p");
  heading.className = "reasons-heading";
  heading.textContent = "Why this matched";
  wrap.appendChild(heading);

  const list = document.createElement("ul");
  list.className = "reason-list";
  const VISIBLE = 4;
  reasons.forEach((reason, index) => {
    const li = document.createElement("li");
    li.textContent = humanizeReason(reason);
    if (index >= VISIBLE) li.classList.add("reason-hidden");
    list.appendChild(li);
  });
  wrap.appendChild(list);

  if (reasons.length > VISIBLE) {
    const hidden = reasons.length - VISIBLE;
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "reasons-toggle";
    toggle.textContent = `Show ${hidden} more reason${hidden === 1 ? "" : "s"}`;
    toggle.addEventListener("click", () => {
      const open = wrap.classList.toggle("reasons-open");
      toggle.textContent = open
        ? "Show fewer reasons"
        : `Show ${hidden} more reason${hidden === 1 ? "" : "s"}`;
    });
    wrap.appendChild(toggle);
  }
  return wrap;
}

function buildSpecialRequirements(requirements) {
  const wrap = document.createElement("div");
  wrap.className = "special-requirements";

  const heading = document.createElement("p");
  heading.className = "special-requirements-heading";
  heading.textContent = "Special eligibility to verify";
  wrap.appendChild(heading);

  const list = document.createElement("ul");
  list.className = "special-requirements-list";
  for (const requirement of requirements) {
    const li = document.createElement("li");
    const label = document.createElement("strong");
    label.textContent = requirement.label || "Extra eligibility check";
    li.appendChild(label);
    if (requirement.details) {
      li.appendChild(document.createTextNode(` — ${requirement.details}`));
    }
    list.appendChild(li);
  }
  wrap.appendChild(list);

  return wrap;
}

function buildCard(card, tierClass) {
  const article = document.createElement("article");
  article.className = `match-card ${tierClass}`;

  const pathBar = document.createElement("div");
  pathBar.className = "path-bar";
  pathBar.setAttribute("aria-hidden", "true");

  const body = document.createElement("div");
  body.className = "card-body";

  const header = document.createElement("div");
  header.className = "card-header";

  const headline = document.createElement("div");
  headline.className = "card-headline";

  const title = document.createElement("h4");
  title.className = "card-title";
  title.textContent = card.name;
  headline.appendChild(title);

  if (card.sponsor) {
    const sponsor = document.createElement("p");
    sponsor.className = "card-sponsor";
    sponsor.textContent = card.sponsor;
    headline.appendChild(sponsor);
  }
  header.appendChild(headline);

  if (typeof card.score === "number") {
    header.appendChild(buildFitRing(card.score, tierClass));
  }

  const stats = buildStatRow(card);

  const badges = document.createElement("div");
  badges.className = "badge-row";
  if (card.closing_soon) {
    badges.appendChild(makeBadge("Closing soon", "badge-closing"));
  }
  if (!card.verified) {
    badges.appendChild(makeBadge("Unverified data", "badge-unverified"));
  }
  if (card.requires_special_check) {
    badges.appendChild(makeBadge("Special eligibility", "badge-special"));
  }
  if (card.eligible_schools && card.eligible_schools.length > 0) {
    const targetMatched = card.score_breakdown && card.score_breakdown.target_school > 0;
    if (targetMatched) {
      badges.appendChild(makeBadge("★ At your target school", "badge-school-match"));
    } else {
      badges.appendChild(
        makeBadge("Only at " + schoolBadgeLabel(card.eligible_schools), "badge-school")
      );
    }
  }

  body.appendChild(header);
  body.appendChild(stats);
  const provenance = buildVerificationSource(card);
  if (provenance) {
    body.appendChild(provenance);
  }
  const breakdown = card.score_breakdown ? buildScoreBreakdown(card.score_breakdown) : null;
  if (breakdown) {
    body.appendChild(breakdown);
  }
  if (badges.childElementCount > 0) {
    body.appendChild(badges);
  }

  if (card.special_requirements && card.special_requirements.length > 0) {
    body.appendChild(buildSpecialRequirements(card.special_requirements));
  }

  if (card.match_reasons && card.match_reasons.length > 0) {
    body.appendChild(buildReasons(card.match_reasons));
  }

  const link = document.createElement("a");
  link.className = "card-link";
  link.href = card.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = card.requires_special_check ? "Check sponsor page" : "View and apply";

  const footer = document.createElement("div");
  footer.className = "card-footer";
  footer.appendChild(link);

  const actions = document.createElement("div");
  actions.className = "card-actions";

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "btn-save";
  applySavedButtonState(saveBtn, savedIds.has(card.scholarship_id));
  saveBtn.addEventListener("click", () => toggleSaved(card.scholarship_id, saveBtn));
  actions.appendChild(saveBtn);

  const adviceBtn = document.createElement("button");
  adviceBtn.type = "button";
  adviceBtn.className = "btn-secondary";
  adviceBtn.textContent = "Get essay advice";

  const adviceLoading = document.createElement("div");
  adviceLoading.className = "essay-advice-loading";
  adviceLoading.hidden = true;
  adviceLoading.innerHTML =
    '<div class="loading-spinner" aria-hidden="true"></div><p>Writing essay advice for this scholarship...</p>';

  const adviceError = document.createElement("div");
  adviceError.className = "essay-advice-error";
  adviceError.hidden = true;
  adviceError.setAttribute("role", "alert");

  const advicePanel = document.createElement("div");
  advicePanel.className = "essay-advice-panel";
  advicePanel.hidden = true;

  adviceBtn.addEventListener("click", () =>
    handleEssayAdvice(card.scholarship_id, adviceBtn, advicePanel, adviceLoading, adviceError)
  );
  actions.appendChild(adviceBtn);

  const reviewBtn = document.createElement("button");
  reviewBtn.type = "button";
  reviewBtn.className = "btn-secondary";
  reviewBtn.textContent = "Review my draft";

  const reviewForm = document.createElement("div");
  reviewForm.className = "essay-review-form";
  reviewForm.hidden = true;

  const reviewInput = document.createElement("textarea");
  reviewInput.className = "essay-review-input";
  reviewInput.rows = 8;
  reviewInput.maxLength = 8000;
  reviewInput.placeholder =
    "Paste your draft essay here, then click Get feedback. Your profile answers are included automatically.";

  const reviewSubmit = document.createElement("button");
  reviewSubmit.type = "button";
  reviewSubmit.className = "btn-primary";
  reviewSubmit.textContent = "Get feedback";

  reviewForm.appendChild(reviewInput);
  reviewForm.appendChild(reviewSubmit);

  const reviewLoading = document.createElement("div");
  reviewLoading.className = "essay-advice-loading";
  reviewLoading.hidden = true;
  reviewLoading.innerHTML =
    '<div class="loading-spinner" aria-hidden="true"></div><p>Reviewing your draft for this scholarship...</p>';

  const reviewError = document.createElement("div");
  reviewError.className = "essay-advice-error";
  reviewError.hidden = true;
  reviewError.setAttribute("role", "alert");

  const reviewPanel = document.createElement("div");
  reviewPanel.className = "essay-advice-panel";
  reviewPanel.hidden = true;

  reviewBtn.addEventListener("click", () => {
    reviewForm.hidden = !reviewForm.hidden;
    if (!reviewForm.hidden) {
      reviewInput.focus();
    }
  });
  reviewSubmit.addEventListener("click", () =>
    handleEssayReview(
      card.scholarship_id,
      reviewInput,
      reviewSubmit,
      reviewPanel,
      reviewLoading,
      reviewError
    )
  );
  actions.appendChild(reviewBtn);

  footer.appendChild(actions);
  body.appendChild(footer);
  body.appendChild(adviceLoading);
  body.appendChild(adviceError);
  body.appendChild(advicePanel);
  body.appendChild(reviewForm);
  body.appendChild(reviewLoading);
  body.appendChild(reviewError);
  body.appendChild(reviewPanel);

  article.appendChild(pathBar);
  article.appendChild(body);
  return article;
}

// Breaks the single fit score into its contributing parts so the "transparent
// scoring" promise is visible, not just claimed. Only non-zero parts are shown.
function buildScoreBreakdown(breakdown) {
  const parts = [
    ["Field of study", breakdown.field_of_study],
    ["Background", breakdown.demographics],
    ["Target school", breakdown.target_school],
    ["Activities", breakdown.activities],
    ["Financial need", breakdown.financial_need],
  ].filter(([, value]) => value > 0);
  if (parts.length === 0) {
    return null;
  }
  const wrap = document.createElement("div");
  wrap.className = "score-breakdown";
  for (const [label, value] of parts) {
    const chip = document.createElement("span");
    chip.className = "score-chip";
    chip.textContent = `${label} +${value}`;
    wrap.appendChild(chip);
  }
  return wrap;
}

// A fact audit older than this is flagged for re-verification. Sponsor pages
// change over a cycle, so a stale audit date should prompt a fresh check.
const STALE_VERIFICATION_DAYS = 90;

// Parse a "YYYY-MM-DD" date as UTC to avoid local-timezone off-by-one errors.
function parseIsoDateUTC(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || ""));
  if (!match) {
    return null;
  }
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function verificationAgeDays(isoDate) {
  const then = parseIsoDateUTC(isoDate);
  if (then === null) {
    return null;
  }
  return Math.floor((Date.now() - then) / 86400000);
}

function formatVerifiedDate(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || ""));
  if (!match) {
    return isoDate;
  }
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[Number(match[2]) - 1]} ${Number(match[3])}, ${match[1]}`;
}

function buildVerificationSource(card) {
  if (!card.verification_source_url && !card.last_verified_at) {
    return null;
  }
  const wrap = document.createElement("div");
  wrap.className = "verification-source";
  let stale = false;
  if (card.last_verified_at) {
    const ageDays = verificationAgeDays(card.last_verified_at);
    stale = ageDays !== null && ageDays > STALE_VERIFICATION_DAYS;
    const date = document.createElement("span");
    date.textContent = `Verified ${formatVerifiedDate(card.last_verified_at)}`;
    wrap.appendChild(date);
    if (stale) {
      wrap.classList.add("verification-stale");
      const flag = document.createElement("span");
      flag.className = "verification-stale-flag";
      flag.textContent = "Re-verify on source";
      wrap.appendChild(flag);
    }
  } else if (card.verification_source_url) {
    const source = document.createElement("span");
    source.textContent = "Official source on file";
    wrap.appendChild(source);
  }
  if (card.verification_source_url) {
    const link = document.createElement("a");
    link.href = card.verification_source_url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = stale
      ? "Re-check on sponsor page"
      : card.last_verified_at
      ? "View verified source"
      : "View sponsor page";
    wrap.appendChild(link);
  }
  return wrap;
}

function schoolBadgeLabel(schools) {
  if (schools.length === 1) {
    return schools[0];
  }
  return `${schools[0]} +${schools.length - 1}`;
}

function makeBadge(text, className) {
  const span = document.createElement("span");
  span.className = `badge ${className}`;
  span.textContent = text;
  return span;
}

function formatAward(amount) {
  if (typeof amount === "number") {
    return `$${amount.toLocaleString()}`;
  }
  return String(amount);
}

function formatDeadline(deadline, estimated) {
  if (deadline === "rolling") {
    return "Rolling";
  }
  if (!deadline || deadline === "VERIFY" || String(deadline).startsWith("VERIFY")) {
    return estimated
      ? `~${estimated} (estimated — confirm official date)`
      : "Confirm on sponsor site";
  }
  return deadline;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Explicit, one-time consent before any inputs (profile, résumé, essay text,
// which include sensitive fields) are sent to Anthropic's third-party API.
function ensureAiConsent() {
  if (localStorage.getItem("ai_consent") === "yes") {
    return true;
  }
  const ok = window.confirm(
    "This feature sends your inputs — including your profile details and any résumé or " +
      "essay text you provide — to Anthropic's API to generate AI guidance. Your data is " +
      "processed there to produce the result and is not stored by this app. Continue?"
  );
  if (ok) {
    localStorage.setItem("ai_consent", "yes");
  }
  return ok;
}

async function handleEssayAdvice(scholarshipId, button, panel, loading, errorEl) {
  if (!lastSubmittedProfile) {
    errorEl.textContent =
      "Submit your profile first so essay advice can use your current answers.";
    errorEl.hidden = false;
    panel.hidden = true;
    return;
  }

  if (!ensureAiConsent()) {
    return;
  }

  errorEl.hidden = true;
  panel.hidden = true;
  loading.hidden = false;
  button.disabled = true;

  try {
    const response = await fetch("/essay-advice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student: lastSubmittedProfile,
        scholarship_id: scholarshipId,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      const message =
        data.detail?.error ||
        (typeof data.detail === "string" ? data.detail : null) ||
        "Essay advice could not be loaded. Try again in a few minutes.";
      errorEl.textContent = message;
      errorEl.hidden = false;
      return;
    }

    panel.innerHTML = "";
    const heading = document.createElement("h5");
    heading.className = "essay-advice-heading";
    heading.textContent = "Essay advice";
    const content = document.createElement("div");
    content.className = "essay-advice-content";
    content.textContent = data.advice;
    panel.appendChild(heading);
    panel.appendChild(content);
    panel.hidden = false;
  } catch (err) {
    errorEl.textContent =
      "Essay advice could not be loaded. Check your connection and try again.";
    errorEl.hidden = false;
    console.error(err);
  } finally {
    loading.hidden = true;
    button.disabled = false;
  }
}

async function handleEssayReview(scholarshipId, input, button, panel, loading, errorEl) {
  if (!lastSubmittedProfile) {
    errorEl.textContent =
      "Submit your profile first so feedback can use your current answers.";
    errorEl.hidden = false;
    panel.hidden = true;
    return;
  }

  const draft = input.value.trim();
  if (!draft) {
    errorEl.textContent = "Paste your draft essay before asking for feedback.";
    errorEl.hidden = false;
    panel.hidden = true;
    return;
  }

  if (!ensureAiConsent()) {
    return;
  }

  errorEl.hidden = true;
  panel.hidden = true;
  loading.hidden = false;
  button.disabled = true;

  try {
    const response = await fetch("/essay-review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student: lastSubmittedProfile,
        scholarship_id: scholarshipId,
        draft,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      const message =
        data.detail?.error ||
        (typeof data.detail === "string" ? data.detail : null) ||
        "Feedback could not be loaded. Try again in a few minutes.";
      errorEl.textContent = message;
      errorEl.hidden = false;
      return;
    }

    panel.innerHTML = "";
    const heading = document.createElement("h5");
    heading.className = "essay-advice-heading";
    heading.textContent = "Draft feedback";
    const content = document.createElement("div");
    content.className = "essay-advice-content";
    content.textContent = data.feedback;
    panel.appendChild(heading);
    panel.appendChild(content);
    panel.hidden = false;
  } catch (err) {
    errorEl.textContent =
      "Feedback could not be loaded. Check your connection and try again.";
    errorEl.hidden = false;
    console.error(err);
  } finally {
    loading.hidden = true;
    button.disabled = false;
  }
}
