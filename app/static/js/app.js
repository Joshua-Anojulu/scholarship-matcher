/**
 * Scholarships4U frontend.
 *
 * Logged-out users get the original stateless experience. Logged-in users can
 * save their profile (it prefills on return) and bookmark scholarships/programs. Session
 * state lives in an httponly cookie set by the server, not in browser storage.
 */

let vocabulary = null;
let lastSubmittedProfile = null;
let lastResults = null;
let lastPrograms = null;
let catalogScholarships = null;
let catalogPrograms = null;
let catalogScholarshipsPromise = null;
let catalogProgramsPromise = null;
let activeOpportunityView = "scholarships";
let scholarshipSearchQuery = "";
let programSearchQuery = "";
let catalogSearchQuery = "";
let searchInDescriptions = false;

let currentUser = null;
const savedIds = new Set();
const savedProgramIds = new Set();
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
const browseCatalogBtn = document.getElementById("browse-catalog-btn");
const opportunityTabs = document.getElementById("opportunity-tabs");
const opportunityTabButtons = Array.from(document.querySelectorAll(".opportunity-tab"));
const scholarshipsTabCount = document.getElementById("scholarships-tab-count");
const programsTabCount = document.getElementById("programs-tab-count");
const catalogTabCount = document.getElementById("catalog-tab-count");
const savedTabCount = document.getElementById("saved-tab-count");

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
const scholarshipSearch = document.getElementById("scholarship-search");
const programSearch = document.getElementById("program-search");
const programsSearchPanel = document.getElementById("programs-search-panel");
const catalogSection = document.getElementById("catalog-section");
const catalogSummary = document.getElementById("catalog-summary");
const catalogSearch = document.getElementById("catalog-search");
const catalogEmpty = document.getElementById("catalog-empty");
const catalogContainer = document.getElementById("catalog-container");

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
  wireOpportunityTabs();
  wireFilterControls();
  wireSearchControls();
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

function wireOpportunityTabs() {
  for (const button of opportunityTabButtons) {
    button.addEventListener("click", () => {
      const view = button.dataset.view || "scholarships";
      activateOpportunityView(view, { scroll: true });
    });
  }
  browseCatalogBtn?.addEventListener("click", () => {
    activateOpportunityView("catalog", { scroll: true });
  });
  updateOpportunityTabCounts();
}

function updateOpportunityTabCounts() {
  if (scholarshipsTabCount) {
    scholarshipsTabCount.textContent = lastResults ? String(lastResults.length) : "0";
  }
  if (programsTabCount) {
    programsTabCount.textContent = lastPrograms ? String(lastPrograms.length) : "0";
  }
  if (catalogTabCount) {
    const loadedCount =
      catalogScholarships && catalogPrograms
        ? catalogScholarships.length + catalogPrograms.length
        : null;
    catalogTabCount.textContent = loadedCount === null ? "All" : String(loadedCount);
  }
  if (savedTabCount) {
    savedTabCount.textContent = String(savedIds.size + savedProgramIds.size);
  }
}

function setOpportunityTabsVisible(visible) {
  if (!opportunityTabs) {
    return;
  }
  opportunityTabs.hidden = !visible;
}

async function activateOpportunityView(view, options = {}) {
  activeOpportunityView = view;
  setOpportunityTabsVisible(true);

  for (const button of opportunityTabButtons) {
    const selected = button.dataset.view === view;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-selected", selected ? "true" : "false");
  }

  resultsSection.hidden = view !== "scholarships" || !lastResults;
  programsSection.hidden = view !== "programs" || lastPrograms === null;
  catalogSection.hidden = view !== "catalog";
  savedSection.hidden = view !== "saved";

  if (view === "programs" && lastPrograms !== null) {
    renderPrograms(lastPrograms);
    programsSection.hidden = false;
  }

  if (view === "catalog") {
    await showCatalogView();
  }

  if (view === "saved") {
    if (currentUser) {
      await showSavedView({ scroll: false });
    } else {
      savedSection.hidden = false;
      savedContainer.innerHTML = "";
      savedEmpty.hidden = false;
      savedSummary.textContent = "Log in to save scholarships and summer programs to your application plan.";
    }
  }

  updateOpportunityTabCounts();

  if (options.scroll) {
    const target =
      view === "programs"
        ? programsSection
        : view === "catalog"
        ? catalogSection
        : view === "saved"
        ? savedSection
        : resultsSection;
    (target || opportunityTabs).scrollIntoView({ behavior: "smooth", block: "start" });
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

function wireSearchControls() {
  const rerenderScholarships = debounce(() => {
    rerenderResults();
    ensureCatalogData(["scholarships"]).then(rerenderResults).catch(console.error);
  }, 150);
  const rerenderPrograms = debounce(() => {
    if (lastPrograms) {
      renderPrograms(lastPrograms);
    }
    ensureCatalogData(["programs"])
      .then(() => {
        if (lastPrograms) {
          renderPrograms(lastPrograms);
        }
      })
      .catch(console.error);
  }, 150);
  const rerenderCatalog = debounce(() => {
    renderCatalog();
  }, 150);

  scholarshipSearch?.addEventListener("input", () => {
    scholarshipSearchQuery = scholarshipSearch.value.trim();
    rerenderScholarships();
  });
  programSearch?.addEventListener("input", () => {
    programSearchQuery = programSearch.value.trim();
    rerenderPrograms();
  });
  catalogSearch?.addEventListener("input", () => {
    catalogSearchQuery = catalogSearch.value.trim();
    rerenderCatalog();
  });

  const descriptionToggles = Array.from(
    document.querySelectorAll(".search-descriptions-toggle")
  );
  descriptionToggles.forEach((toggle) => {
    toggle.addEventListener("change", () => {
      searchInDescriptions = toggle.checked;
      descriptionToggles.forEach((other) => {
        other.checked = searchInDescriptions;
      });
      rerenderResults();
      if (lastPrograms) {
        renderPrograms(lastPrograms);
      }
      renderCatalog();
    });
  });
}

function debounce(fn, delay = 150) {
  let timer = null;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), delay);
  };
}

function resetFilters() {
  filterQuality.value = "all";
  filterSort.value = "fit";
  filterMinScore.value = "0";
  filterMinScoreValue.textContent = "0";
  scholarshipSearch.value = "";
  scholarshipSearchQuery = "";
  searchInDescriptions = false;
  for (const toggle of document.querySelectorAll(".search-descriptions-toggle")) {
    toggle.checked = false;
  }
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

function normalizeSearch(text) {
  return String(text || "").toLowerCase();
}

function itemMatchesSearch(values, query) {
  // Require every whitespace-separated word to appear in at least one field
  // (AND across words, OR across fields), so multi-word queries narrow instead
  // of looking for one literal substring.
  const tokens = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) {
    return true;
  }
  const haystacks = values.filter(Boolean).map(normalizeSearch);
  return tokens.every((token) => haystacks.some((value) => value.includes(token)));
}

function noResultsMessage(query, noun) {
  const wrap = document.createElement("div");
  wrap.className = "results-empty panel";
  const heading = document.createElement("h3");
  heading.textContent = `No ${noun} results for "${query}"`;
  const copy = document.createElement("p");
  copy.textContent = "Try fewer or different words, or turn on 'Search descriptions' for a wider search.";
  wrap.appendChild(heading);
  wrap.appendChild(copy);
  return wrap;
}

function catalogScholarshipById(id) {
  return (catalogScholarships || []).find((scholarship) => scholarship.id === id) || null;
}

function catalogProgramById(id) {
  return (catalogPrograms || []).find((program) => program.id === id) || null;
}

function scholarshipSearchValues(resultOrScholarship) {
  const scholarshipId = resultOrScholarship.scholarship_id || resultOrScholarship.id;
  const catalogItem = catalogScholarshipById(scholarshipId);
  // Default scope is identity only (name + sponsor) so common words in the
  // description don't flood results. The "Search descriptions" toggle widens it.
  const values = [
    resultOrScholarship.scholarship_name,
    resultOrScholarship.name,
    resultOrScholarship.sponsor,
    catalogItem?.sponsor,
  ];
  if (searchInDescriptions) {
    values.push(
      resultOrScholarship.description,
      catalogItem?.description,
      ...(resultOrScholarship.match_reasons || []),
    );
  }
  return values;
}

function programSearchValues(program) {
  const programId = program.program_id || program.id;
  const catalogItem = catalogProgramById(programId);
  // Default scope is identity only (name + host + subject).
  const values = [
    program.name,
    program.host,
    program.subject,
    catalogItem?.host,
    catalogItem?.subject,
  ];
  if (searchInDescriptions) {
    values.push(
      program.description,
      catalogItem?.description,
      ...(program.match_reasons || []),
    );
  }
  return values;
}

function applyProgramFilters(programs) {
  return programs.filter((program) => itemMatchesSearch(programSearchValues(program), programSearchQuery));
}

// Field score of 40 means a specific field-of-study match (10 = open-to-all).
const SPECIFIC_FIELD_SCORE = 40;

function applyResultFilters(results) {
  const minScore = Number(filterMinScore.value) || 0;
  const quality = filterQuality.value;
  return results.filter((r) => {
    if (!itemMatchesSearch(scholarshipSearchValues(r), scholarshipSearchQuery)) {
      return false;
    }
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
const googleSettingsNote = document.getElementById("google-settings-note");
const passwordSettingsSection = document.getElementById("password-settings-section");
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
  updateSettingsControls();
  settingsModal.hidden = false;
  if (currentUser?.has_password === false) {
    document.getElementById("settings-close").focus();
  } else {
    document.getElementById("current-password").focus();
  }
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

function updateSettingsControls() {
  const hasPassword = currentUser?.has_password !== false;
  if (passwordSettingsSection) {
    passwordSettingsSection.hidden = !hasPassword;
  }
  if (googleSettingsNote) {
    googleSettingsNote.hidden = hasPassword;
  }
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
  if (currentUser?.has_password === false) {
    showSettingsError("This account signs in with Google and does not have a password to change.");
    return;
  }
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
  if (currentUser?.has_password === false) {
    showSettingsError("Google-only accounts do not have a password for this confirmation step.");
    return;
  }
  const password = document.getElementById("current-password").value;
  if (!password) {
    showSettingsError("Enter your current password above to confirm deletion.");
    return;
  }
  if (
    !window.confirm(
      "Delete your account permanently? This removes your profile and saved scholarships/programs."
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
    savedProgramIds.clear();
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
      ? "Log in to save your profile and bookmark scholarships/programs."
      : "Sign up to save your profile and bookmark scholarships/programs.");
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
  savedProgramIds.clear();
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
      savedIds.clear();
      savedProgramIds.clear();
      renderAuthState();
    }
  } catch (err) {
    currentUser = null;
    savedIds.clear();
    savedProgramIds.clear();
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
  updateOpportunityTabCounts();
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

/* ---------- Saved scholarships/programs ---------- */

function syncSavedState(data) {
  savedIds.clear();
  savedProgramIds.clear();
  for (const item of data.saved || []) {
    savedIds.add(item.scholarship_id);
  }
  for (const item of data.programs || []) {
    savedProgramIds.add(item.program_id);
  }
  updateSavedCount();
}

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
    syncSavedState(data);
    if (!savedSection.hidden) {
      renderSaved(data.saved, data.programs || []);
    }
  } catch (err) {
    console.error(err);
  }
}

function updateSavedCount() {
  const count = savedIds.size + savedProgramIds.size;
  savedCountEl.textContent = String(count);
  savedCountEl.hidden = count === 0;
  updateOpportunityTabCounts();
}

async function toggleSavedView() {
  await activateOpportunityView("saved", { scroll: true });
}

async function showSavedView(options = {}) {
  savedSection.hidden = false;
  savedContainer.innerHTML = "";
  savedSummary.textContent = "Loading...";
  try {
    const response = await fetch("/account/saved");
    if (!response.ok) {
      savedSummary.textContent = "Saved items could not be loaded.";
      return;
    }
    const data = await response.json();
    syncSavedState(data);
    renderSaved(data.saved, data.programs || []);
  } catch (err) {
    savedSummary.textContent = "Saved items could not be loaded.";
    console.error(err);
  }
  if (options.scroll !== false) {
    savedSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }
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
  const head = `${total} saved item${total === 1 ? "" : "s"}`;
  const totalSteps = items.reduce(
    (sum, item) =>
      sum +
      (item.scholarship?.application_requirements?.length ||
        item.program?.application_requirements?.length ||
        0),
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
    const existingPlan = savedContainer.querySelector(".plan-guidance");
    if (existingPlan) {
      existingPlan.replaceWith(buildPlanGuidance(trackerItems));
    }
  }
}

function renderSaved(scholarshipItems, programItems = []) {
  const items = [...(scholarshipItems || []), ...(programItems || [])];
  trackerItems = items;
  savedContainer.innerHTML = "";
  if (items.length === 0) {
    savedSummary.textContent = "";
    savedEmpty.hidden = false;
    return;
  }
  savedEmpty.hidden = true;
  savedSummary.textContent = trackerSummary(items);
  savedContainer.appendChild(buildPlanGuidance(items));

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
    (cardBody || card).appendChild(buildTrackerControls(item, card, "scholarship"));
    savedContainer.appendChild(card);
  }

  for (const item of programItems || []) {
    if (!item.program) {
      continue;
    }
    const card = buildProgramCard(item.program, { savedContext: true });
    card.classList.add(`status-${item.status || "interested"}`);
    const cardBody = card.querySelector(".card-body");
    (cardBody || card).appendChild(buildTrackerControls(item, card, "program"));
    savedContainer.appendChild(card);
  }
}

function savedOpportunity(item) {
  return item.scholarship || item.program || null;
}

function savedOpportunityKind(item) {
  return item.program ? "Program" : "Scholarship";
}

function savedOpportunityName(item) {
  const opportunity = savedOpportunity(item);
  return opportunity?.name || opportunity?.scholarship_name || "Saved opportunity";
}

function savedOpportunityDeadline(item) {
  const opportunity = savedOpportunity(item);
  return opportunity?.deadline || "";
}

function savedOpportunityEstimatedDeadline(item) {
  const opportunity = savedOpportunity(item);
  return opportunity?.estimated_deadline || null;
}

function savedOpportunityRequirements(item) {
  return savedOpportunity(item)?.application_requirements || [];
}

function savedOpportunitySpecialRequirements(item) {
  const opportunity = savedOpportunity(item);
  return opportunity?.special_requirements?.length
    ? opportunity.special_requirements
    : opportunity?.eligibility?.special_requirements || [];
}

function parseRealDeadline(deadline) {
  if (!deadline || deadline === "rolling" || String(deadline).startsWith("VERIFY")) {
    return null;
  }
  const parsed = new Date(`${deadline}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function daysUntil(deadline) {
  const parsed = parseRealDeadline(deadline);
  if (!parsed) {
    return null;
  }
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.ceil((parsed - today) / (1000 * 60 * 60 * 24));
}

function deadlinePriority(item) {
  const realDays = daysUntil(savedOpportunityDeadline(item));
  if (realDays === null) {
    return 12000;
  }
  return realDays < 0 ? 30000 + Math.abs(realDays) : realDays;
}

function incompleteRequirements(item) {
  const completed = new Set(item.completed_requirement_ids || []);
  return savedOpportunityRequirements(item).filter((requirement) => !completed.has(requirement.id));
}

function requirementMatches(requirement, patterns) {
  const text = `${requirement.label || ""} ${requirement.details || ""}`.toLowerCase();
  return patterns.some((pattern) => text.includes(pattern));
}

function firstIncompleteRequired(items) {
  const sorted = [...items].sort((a, b) => {
    return deadlinePriority(a) - deadlinePriority(b);
  });
  for (const item of sorted) {
    const next = incompleteRequirements(item).find((requirement) => requirement.required !== false);
    if (next) {
      return { item, requirement: next };
    }
  }
  return null;
}

function collectRequirementNeeds(items, patterns, limit = 4) {
  const needs = [];
  for (const item of items) {
    for (const requirement of incompleteRequirements(item)) {
      if (requirementMatches(requirement, patterns)) {
        needs.push({ item, requirement });
      }
    }
  }
  return needs.slice(0, limit);
}

function formatNeedList(needs) {
  return needs
    .map(({ item, requirement }) => `${savedOpportunityName(item)}: ${requirement.label}`)
    .join("; ");
}

const REQUIREMENT_GROUPS = [
  {
    key: "writing",
    label: "Writing",
    patterns: ["essay", "short answer", "short-answer", "response", "personal statement", "statement"],
  },
  {
    key: "recommendations",
    label: "Recs",
    patterns: ["recommend", "teacher", "counselor", "reference", "letter"],
  },
  {
    key: "records",
    label: "Records",
    patterns: ["transcript", "grade report", "academic record", "school profile", "test score"],
  },
  {
    key: "forms",
    label: "Forms",
    patterns: ["application", "form", "portal", "account", "submit"],
  },
  {
    key: "interview",
    label: "Interview",
    patterns: ["interview", "finalist", "selection weekend"],
  },
];

function requirementGroup(requirement) {
  const text = `${requirement.label || ""} ${requirement.details || ""}`.toLowerCase();
  return (
    REQUIREMENT_GROUPS.find((group) =>
      group.patterns.some((pattern) => text.includes(pattern))
    ) || { key: "other", label: "Other" }
  );
}

function requirementMatrixForItem(item) {
  const completed = new Set(item.completed_requirement_ids || []);
  const matrix = Object.fromEntries(
    [...REQUIREMENT_GROUPS, { key: "other", label: "Other" }].map((group) => [
      group.key,
      { total: 0, complete: 0 },
    ])
  );
  for (const requirement of savedOpportunityRequirements(item)) {
    const group = requirementGroup(requirement);
    matrix[group.key].total += 1;
    if (completed.has(requirement.id)) {
      matrix[group.key].complete += 1;
    }
  }
  return matrix;
}

function formatRequirementProgress(progress) {
  if (!progress.total) {
    return "None";
  }
  return `${progress.complete}/${progress.total}`;
}

function buildRequirementMatrix(items) {
  const section = document.createElement("section");
  section.className = "plan-matrix";
  section.setAttribute("aria-label", "Requirement matrix");

  const head = document.createElement("div");
  head.className = "plan-subsection-head";
  head.innerHTML =
    "<div><p class=\"eyebrow\">Requirement matrix</p>" +
    "<h4>See what each opportunity is asking for</h4></div>" +
    "<p>Counts show completed checklist steps over total source-linked steps.</p>";
  section.appendChild(head);

  const tableWrap = document.createElement("div");
  tableWrap.className = "plan-table-wrap";
  const table = document.createElement("table");
  table.className = "plan-table";
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  ["Opportunity", ...REQUIREMENT_GROUPS.map((group) => group.label), "Other"].forEach((label) => {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = label;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const item of items) {
    const row = document.createElement("tr");
    const name = document.createElement("th");
    name.scope = "row";
    const kind = document.createElement("span");
    kind.textContent = savedOpportunityKind(item);
    const strong = document.createElement("strong");
    strong.textContent = savedOpportunityName(item);
    name.appendChild(kind);
    name.appendChild(strong);
    row.appendChild(name);

    const matrix = requirementMatrixForItem(item);
    [...REQUIREMENT_GROUPS.map((group) => group.key), "other"].forEach((key) => {
      const td = document.createElement("td");
      const progress = matrix[key];
      td.textContent = formatRequirementProgress(progress);
      if (progress.total && progress.complete === progress.total) {
        td.className = "is-complete";
      } else if (progress.total) {
        td.className = "has-work";
      }
      row.appendChild(td);
    });
    tbody.appendChild(row);
  }
  table.appendChild(tbody);
  tableWrap.appendChild(table);
  section.appendChild(tableWrap);
  return section;
}

function timelineSortValue(item) {
  const realDays = daysUntil(savedOpportunityDeadline(item));
  if (realDays !== null) {
    return realDays < 0 ? 30000 + Math.abs(realDays) : realDays;
  }
  const deadline = savedOpportunityDeadline(item);
  if (deadline === "rolling") {
    return 20000;
  }
  if (String(deadline || "").startsWith("VERIFY")) {
    return 15000;
  }
  return 12000;
}

function timelineStatus(item) {
  const realDays = daysUntil(savedOpportunityDeadline(item));
  if (realDays === null) {
    const parts = deadlineParts(savedOpportunityDeadline(item), savedOpportunityEstimatedDeadline(item));
    return parts.note ? `${parts.value} · ${parts.note}` : parts.value;
  }
  if (realDays < 0) {
    return "Deadline passed";
  }
  if (realDays === 0) {
    return "Due today";
  }
  if (realDays <= 14) {
    return `Due in ${realDays} day${realDays === 1 ? "" : "s"}`;
  }
  return `Due in ${realDays} days`;
}

function buildDeadlineTimeline(items) {
  const section = document.createElement("section");
  section.className = "plan-timeline";
  section.setAttribute("aria-label", "Deadline timeline");

  const head = document.createElement("div");
  head.className = "plan-subsection-head";
  head.innerHTML =
    "<div><p class=\"eyebrow\">Deadline timeline</p>" +
    "<h4>Order your work by time pressure</h4></div>" +
    "<p>Verified dates come first; estimated or unknown dates stay labeled.</p>";
  section.appendChild(head);

  const list = document.createElement("div");
  list.className = "timeline-list";
  const sorted = [...items].sort((a, b) => timelineSortValue(a) - timelineSortValue(b));

  for (const item of sorted.slice(0, 8)) {
    const row = document.createElement("article");
    const realDays = daysUntil(savedOpportunityDeadline(item));
    row.className = "timeline-item";
    if (realDays !== null && realDays <= 14 && realDays >= 0) {
      row.classList.add("is-urgent");
    } else if (realDays !== null && realDays < 0) {
      row.classList.add("is-past");
    } else if (realDays === null) {
      row.classList.add("is-estimated");
    }

    const date = document.createElement("span");
    date.className = "timeline-date";
    date.textContent = timelineStatus(item);

    const copy = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = savedOpportunityName(item);
    const next = incompleteRequirements(item).find((requirement) => requirement.required !== false);
    const detail = document.createElement("p");
    detail.textContent = next
      ? `${savedOpportunityKind(item)} · next step: ${next.label}`
      : `${savedOpportunityKind(item)} · checklist complete or no source-linked steps yet`;
    copy.appendChild(title);
    copy.appendChild(detail);

    row.appendChild(date);
    row.appendChild(copy);
    list.appendChild(row);
  }

  section.appendChild(list);
  return section;
}

const WRITING_REUSE_GROUPS = [
  {
    key: "identity",
    label: "Identity, community, and lived experience",
    patterns: ["identity", "community", "background", "experiences", "adversit", "story"],
  },
  {
    key: "why-fit",
    label: "Why this program or scholarship",
    patterns: ["why", "fit", "course", "program", "major", "future goals", "career"],
  },
  {
    key: "leadership-service",
    label: "Leadership, service, and impact",
    patterns: ["leadership", "service", "impact", "improving", "courage", "veteran", "activities"],
  },
  {
    key: "academic-research",
    label: "Academic interest, research, or problem solving",
    patterns: ["academic", "research", "problem set", "solutions", "project", "stem", "science", "mathematics"],
  },
  {
    key: "general-writing",
    label: "General essays and short answers",
    patterns: ["essay", "short answer", "short-answer", "response", "statement", "writing"],
  },
];

function isWritingRequirement(requirement) {
  return requirementMatches(requirement, [
    "essay",
    "short answer",
    "short-answer",
    "response",
    "statement",
    "writing",
    "problem set",
    "solutions",
  ]);
}

function writingReuseGroup(requirement) {
  const text = `${requirement.label || ""} ${requirement.details || ""}`.toLowerCase();
  return (
    WRITING_REUSE_GROUPS.find((group) =>
      group.patterns.some((pattern) => text.includes(pattern))
    ) || WRITING_REUSE_GROUPS[WRITING_REUSE_GROUPS.length - 1]
  );
}

function collectWritingClusters(items) {
  const clusters = new Map(
    WRITING_REUSE_GROUPS.map((group) => [group.key, { group, needs: [] }])
  );
  for (const item of items) {
    for (const requirement of incompleteRequirements(item)) {
      if (!isWritingRequirement(requirement)) {
        continue;
      }
      const group = writingReuseGroup(requirement);
      clusters.get(group.key).needs.push({ item, requirement });
    }
  }
  return Array.from(clusters.values())
    .filter((cluster) => cluster.needs.length > 0)
    .sort((a, b) => b.needs.length - a.needs.length);
}

function buildEssayReuseMap(items) {
  const section = document.createElement("section");
  section.className = "plan-essay-map";
  section.setAttribute("aria-label", "Essay reuse map");

  const head = document.createElement("div");
  head.className = "plan-subsection-head";
  head.innerHTML =
    "<div><p class=\"eyebrow\">Essay reuse map</p>" +
    "<h4>Draft once, tailor carefully</h4></div>" +
    "<p>Groups unfinished writing steps by likely reusable theme. Always answer each official prompt directly.</p>";
  section.appendChild(head);

  const clusters = collectWritingClusters(items);
  const wrap = document.createElement("div");
  wrap.className = "essay-clusters";
  if (!clusters.length) {
    const empty = document.createElement("p");
    empty.className = "plan-empty-note";
    empty.textContent = "No unfinished essay, short-answer, or problem-set steps detected in your saved checklist.";
    wrap.appendChild(empty);
  }

  for (const cluster of clusters.slice(0, 5)) {
    const card = document.createElement("article");
    card.className = "essay-cluster";
    const title = document.createElement("h5");
    title.textContent = cluster.group.label;
    const meta = document.createElement("p");
    const count = cluster.needs.length;
    meta.textContent = `${count} unfinished writing step${count === 1 ? "" : "s"} could share a base draft.`;

    const list = document.createElement("ul");
    for (const need of cluster.needs.slice(0, 4)) {
      const li = document.createElement("li");
      li.textContent = `${savedOpportunityName(need.item)}: ${need.requirement.label}`;
      list.appendChild(li);
    }
    if (cluster.needs.length > 4) {
      const li = document.createElement("li");
      li.textContent = `+ ${cluster.needs.length - 4} more`;
      list.appendChild(li);
    }

    card.appendChild(title);
    card.appendChild(meta);
    card.appendChild(list);
    wrap.appendChild(card);
  }

  section.appendChild(wrap);
  return section;
}

function buildSpecialEligibilityPanel(items) {
  const section = document.createElement("section");
  section.className = "plan-special-panel";
  section.setAttribute("aria-label", "Special eligibility checks");

  const head = document.createElement("div");
  head.className = "plan-subsection-head";
  head.innerHTML =
    "<div><p class=\"eyebrow\">Special eligibility checks</p>" +
    "<h4>Confirm the strict gates before going deep</h4></div>" +
    "<p>These are niche requirements like nomination, finalist status, membership, or sponsor affiliation.</p>";
  section.appendChild(head);

  const specialItems = items.filter((item) => savedOpportunitySpecialRequirements(item).length > 0);
  const wrap = document.createElement("div");
  wrap.className = "special-check-list";
  if (!specialItems.length) {
    const empty = document.createElement("p");
    empty.className = "plan-empty-note";
    empty.textContent = "No special eligibility checks detected in the opportunities you saved.";
    wrap.appendChild(empty);
  }

  for (const item of specialItems) {
    const card = document.createElement("article");
    card.className = "special-check-card";
    const title = document.createElement("h5");
    title.textContent = savedOpportunityName(item);
    const type = document.createElement("p");
    type.textContent = `${savedOpportunityKind(item)} · verify this before investing major time`;
    const list = document.createElement("ul");
    for (const check of savedOpportunitySpecialRequirements(item)) {
      const li = document.createElement("li");
      li.textContent = specialRequirementText(check);
      list.appendChild(li);
    }
    card.appendChild(title);
    card.appendChild(type);
    card.appendChild(list);
    wrap.appendChild(card);
  }

  section.appendChild(wrap);
  return section;
}

function specialRequirementText(requirement) {
  if (typeof requirement === "string") {
    return requirement;
  }
  const label = requirement?.label || "Extra eligibility check";
  return requirement?.details ? `${label} — ${requirement.details}` : label;
}

function deadlineUrgencyText(item) {
  const deadline = savedOpportunityDeadline(item);
  const realDays = daysUntil(deadline);
  if (realDays === null) {
    const parts = deadlineParts(deadline, savedOpportunityEstimatedDeadline(item));
    return `${savedOpportunityName(item)}: ${parts.value}${parts.note ? ` (${parts.note})` : ""}`;
  }
  if (realDays < 0) {
    return `${savedOpportunityName(item)}: deadline has passed`;
  }
  if (realDays === 0) {
    return `${savedOpportunityName(item)}: due today`;
  }
  return `${savedOpportunityName(item)}: due in ${realDays} day${realDays === 1 ? "" : "s"}`;
}

function makePlanCard(title, body, meta = "", tone = "") {
  const card = document.createElement("article");
  card.className = `plan-card ${tone ? `plan-card-${tone}` : ""}`;
  const heading = document.createElement("h4");
  heading.textContent = title;
  const copy = document.createElement("p");
  copy.textContent = body;
  card.appendChild(heading);
  card.appendChild(copy);
  if (meta) {
    const detail = document.createElement("span");
    detail.className = "plan-card-meta";
    detail.textContent = meta;
    card.appendChild(detail);
  }
  return card;
}

function buildPlanGuidance(items) {
  const wrap = document.createElement("div");
  wrap.className = "plan-guidance";

  const totalSteps = items.reduce(
    (sum, item) => sum + savedOpportunityRequirements(item).length,
    0
  );
  const completedSteps = items.reduce(
    (sum, item) => sum + (item.completed_requirement_ids?.length || 0),
    0
  );
  const specialChecks = items.filter((item) => savedOpportunitySpecialRequirements(item).length > 0);
  const realDeadlineItems = items
    .filter((item) => daysUntil(savedOpportunityDeadline(item)) !== null)
    .sort((a, b) => deadlinePriority(a) - deadlinePriority(b));
  const upcomingDeadlines = realDeadlineItems.filter(
    (item) => daysUntil(savedOpportunityDeadline(item)) >= 0
  );
  const nextRequired = firstIncompleteRequired(items);
  const recommendationNeeds = collectRequirementNeeds(items, [
    "recommend",
    "teacher",
    "counselor",
    "reference",
  ]);
  const writingNeeds = collectRequirementNeeds(items, [
    "essay",
    "short answer",
    "short-answer",
    "response",
    "personal statement",
    "problem set",
  ]);
  const transcriptNeeds = collectRequirementNeeds(items, [
    "transcript",
    "grade report",
    "academic record",
    "school profile",
  ]);

  const head = document.createElement("div");
  head.className = "plan-guidance-head";
  head.innerHTML =
    "<div><p class=\"eyebrow\">Application command center</p>" +
    "<h3>What needs attention next</h3>" +
    "<p>Built from your saved scholarships, summer programs, and source-linked checklist steps.</p></div>" +
    `<div class="plan-progress"><strong>${completedSteps}/${totalSteps || 0}</strong><span>steps complete</span></div>`;
  wrap.appendChild(head);

  const stats = document.createElement("div");
  stats.className = "plan-stats";
  stats.appendChild(makePlanCard("Saved", `${items.length} active item${items.length === 1 ? "" : "s"}`));
  stats.appendChild(makePlanCard("Verified steps", totalSteps ? `${totalSteps - completedSteps} left` : "No checklist steps yet"));
  stats.appendChild(makePlanCard("Special checks", `${specialChecks.length} to confirm`));
  stats.appendChild(makePlanCard("Real deadlines", `${upcomingDeadlines.length} dated item${upcomingDeadlines.length === 1 ? "" : "s"}`));
  wrap.appendChild(stats);

  const actions = document.createElement("div");
  actions.className = "plan-actions";
  if (nextRequired) {
    actions.appendChild(
      makePlanCard(
        "Do this next",
        nextRequired.requirement.label,
        `${savedOpportunityKind(nextRequired.item)} - ${savedOpportunityName(nextRequired.item)}`,
        "primary"
      )
    );
  } else {
    actions.appendChild(
      makePlanCard(
        "Do this next",
        "Save an opportunity with checklist steps, or mark your remaining steps complete.",
        "The plan updates as you save and check items off.",
        "primary"
      )
    );
  }
  actions.appendChild(
    makePlanCard(
      "Recommendations",
      recommendationNeeds.length ? formatNeedList(recommendationNeeds) : "No unfinished recommendation steps detected.",
      recommendationNeeds.length ? "Ask early; recommenders are usually the bottleneck." : "",
      "recommendation"
    )
  );
  actions.appendChild(
    makePlanCard(
      "Writing work",
      writingNeeds.length ? formatNeedList(writingNeeds) : "No unfinished essays or written-response steps detected.",
      writingNeeds.length ? "See the essay reuse map below for likely shared draft themes." : "",
      "writing"
    )
  );
  actions.appendChild(
    makePlanCard(
      "Transcripts & records",
      transcriptNeeds.length ? formatNeedList(transcriptNeeds) : "No unfinished transcript or academic-record steps detected.",
      transcriptNeeds.length ? "Some must come from school staff, so start early." : "",
      "records"
    )
  );
  if (specialChecks.length) {
    actions.appendChild(
      makePlanCard(
        "Special eligibility",
        specialChecks.map((item) => savedOpportunityName(item)).join("; "),
        "Confirm nomination, membership, finalist status, or affiliation before investing heavy effort.",
        "special"
      )
    );
  }
  if (upcomingDeadlines.length) {
    actions.appendChild(
      makePlanCard(
        "Upcoming deadlines",
        upcomingDeadlines.slice(0, 3).map(deadlineUrgencyText).join("; "),
        "Only verified ISO deadlines are counted here.",
        "deadline"
      )
    );
  }
  wrap.appendChild(actions);
  wrap.appendChild(buildRequirementMatrix(items));
  wrap.appendChild(buildEssayReuseMap(items));
  wrap.appendChild(buildSpecialEligibilityPanel(items));
  wrap.appendChild(buildDeadlineTimeline(items));

  return wrap;
}

function buildTrackerControls(item, card, kind = "scholarship") {
  const wrap = document.createElement("div");
  wrap.className = "tracker-controls";

  const itemId = kind === "program" ? item.program_id : item.scholarship_id;
  const patcher = kind === "program" ? patchSavedProgram : patchSaved;

  const checklist = buildApplicationChecklist(item, kind);
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
    const ok = await patcher(itemId, { status: select.value });
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
      patcher(itemId, { notes: notes.value });
    }
  });
  notesField.appendChild(notesLabelEl);
  notesField.appendChild(notes);

  wrap.appendChild(statusField);
  wrap.appendChild(notesField);
  return wrap;
}

function buildApplicationChecklist(item, kind = "scholarship") {
  const requirements =
    kind === "program"
      ? item.program?.application_requirements || []
      : item.scholarship?.application_requirements || [];
  if (!requirements.length) {
    return null;
  }

  const itemId = kind === "program" ? item.program_id : item.scholarship_id;
  const patcher = kind === "program" ? patchSavedProgram : patchSaved;

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
      const ok = await patcher(itemId, {
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

async function patchSavedProgram(programId, payload) {
  try {
    const response = await fetch(`/account/saved/programs/${encodeURIComponent(programId)}`, {
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
      syncSavedState(refreshed);
      renderSaved(refreshed.saved, refreshed.programs || []);
    }
  } catch (err) {
    console.error(err);
  } finally {
    button.disabled = false;
  }
}

async function toggleSavedProgram(programId, button) {
  if (!currentUser) {
    openAuthModal("login", "Log in to save summer programs to your account.");
    return;
  }

  const isSaved = savedProgramIds.has(programId);
  button.disabled = true;
  try {
    if (isSaved) {
      const response = await fetch(`/account/saved/programs/${encodeURIComponent(programId)}`, {
        method: "DELETE",
      });
      if (response.ok) {
        savedProgramIds.delete(programId);
      }
    } else {
      const response = await fetch(`/account/saved/programs/${encodeURIComponent(programId)}`, {
        method: "POST",
      });
      if (response.ok) {
        savedProgramIds.add(programId);
      }
    }
    applySavedButtonState(button, savedProgramIds.has(programId));
    updateSavedCount();
    if (!savedSection.hidden) {
      const refreshed = await fetch("/account/saved").then((r) => r.json());
      syncSavedState(refreshed);
      renderSaved(refreshed.saved, refreshed.programs || []);
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
    programsContainer.innerHTML = "";
    programsEmpty.hidden = true;
    programsSearchPanel.hidden = true;
    lastPrograms = null;
    updateOpportunityTabCounts();
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
  programsSection.hidden = true;
  savedSection.hidden = true;
  setOpportunityTabsVisible(false);
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
    updateOpportunityTabCounts();
    await activateOpportunityView("scholarships");
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
    if (scholarshipSearchQuery) {
      resultsContainer.appendChild(noResultsMessage(scholarshipSearchQuery, "scholarship"));
    } else {
      const note = document.createElement("div");
      note.className = "results-empty panel";
      note.innerHTML =
        "<h3>No matches with these filters</h3><p>Loosen a filter or use <strong>Clear filters</strong> to see all matches again.</p>";
      resultsContainer.appendChild(note);
    }
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
      lastPrograms = [];
      updateOpportunityTabCounts();
      return;
    }
    const programs = await response.json();
    lastPrograms = programs;
    updateOpportunityTabCounts();
    renderPrograms(programs);
    if (activeOpportunityView === "programs") {
      programsSection.hidden = false;
    }
  } catch (err) {
    lastPrograms = [];
    updateOpportunityTabCounts();
    console.error(err);
  }
}

function renderPrograms(programs) {
  programsContainer.innerHTML = "";
  lastPrograms = programs;
  updateOpportunityTabCounts();

  if (programs.length === 0) {
    programsSummary.textContent = "";
    programsSearchPanel.hidden = true;
    programsEmpty.hidden = false;
    return;
  }

  programsSearchPanel.hidden = false;
  programsEmpty.hidden = true;

  const filtered = applyProgramFilters(programs);
  if (filtered.length === 0) {
    programsSummary.textContent = `0 of ${programs.length} matched programs shown.`;
    programsEmpty.hidden = true;
    programsContainer.appendChild(noResultsMessage(programSearchQuery, "summer program"));
    return;
  }

  const regular = filtered.filter((p) => !p.requires_special_check);
  const special = filtered.filter((p) => p.requires_special_check);
  const strong = regular.filter((p) => p.match_tier === "strong");
  const possible = regular.filter((p) => p.match_tier === "possible");
  const shownAll = filtered.length === programs.length;
  programsSummary.textContent = shownAll
    ? `${programs.length} program${programs.length === 1 ? "" : "s"} matched your profile.`
    : `Showing ${filtered.length} of ${programs.length} matched programs.`;

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

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} request failed (${response.status})`);
  }
  return response.json();
}

async function ensureCatalogData(kinds = ["scholarships", "programs"]) {
  const requests = [];
  if (kinds.includes("scholarships") && catalogScholarships === null) {
    if (!catalogScholarshipsPromise) {
      catalogScholarshipsPromise = fetchJson("/scholarships")
        .then((scholarships) => {
          catalogScholarships = scholarships;
          updateOpportunityTabCounts();
        })
        .finally(() => {
          catalogScholarshipsPromise = null;
        });
    }
    requests.push(catalogScholarshipsPromise);
  }
  if (kinds.includes("programs") && catalogPrograms === null) {
    if (!catalogProgramsPromise) {
      catalogProgramsPromise = fetchJson("/programs")
        .then((programs) => {
          catalogPrograms = programs;
          updateOpportunityTabCounts();
        })
        .finally(() => {
          catalogProgramsPromise = null;
        });
    }
    requests.push(catalogProgramsPromise);
  }
  await Promise.all(requests);
}

async function showCatalogView() {
  catalogSection.hidden = false;
  if (catalogScholarships === null || catalogPrograms === null) {
    catalogSummary.textContent = "Loading the full catalog...";
    catalogEmpty.hidden = true;
    catalogContainer.innerHTML = "";
    try {
      await ensureCatalogData();
    } catch (err) {
      catalogSummary.textContent = "The catalog could not be loaded.";
      catalogEmpty.hidden = false;
      catalogContainer.innerHTML = "";
      console.error(err);
      return;
    }
  }
  renderCatalog();
}

function renderCatalog() {
  catalogContainer.innerHTML = "";
  if (catalogScholarships === null || catalogPrograms === null) {
    return;
  }
  const scholarships = catalogScholarships.filter((scholarship) =>
    itemMatchesSearch(scholarshipSearchValues(scholarship), catalogSearchQuery)
  );
  const programs = catalogPrograms.filter((program) =>
    itemMatchesSearch(programSearchValues(program), catalogSearchQuery)
  );
  const total = catalogScholarships.length + catalogPrograms.length;
  const shown = scholarships.length + programs.length;

  catalogSummary.textContent = catalogSearchQuery
    ? `Showing ${shown} of ${total} catalog opportunities.`
    : `${total} catalog opportunities available to browse.`;

  if (shown === 0) {
    catalogEmpty.hidden = true;
    catalogContainer.appendChild(noResultsMessage(catalogSearchQuery, "catalog"));
    return;
  }

  catalogEmpty.hidden = true;
  if (scholarships.length > 0) {
    catalogContainer.appendChild(buildCatalogScholarshipSection(scholarships));
  }
  if (programs.length > 0) {
    catalogContainer.appendChild(buildCatalogProgramSection(programs));
  }
}

function buildCatalogScholarshipSection(scholarships) {
  const section = document.createElement("div");
  section.className = "tier-section";
  const heading = document.createElement("h3");
  heading.className = "tier-heading";
  heading.innerHTML = `All scholarships <span class="tier-count">${scholarships.length}</span>`;
  section.appendChild(heading);
  for (const [index, scholarship] of scholarships.entries()) {
    const card = scholarshipToCard(scholarship);
    card.catalog_context = true;
    const element = buildCard(card, "catalog");
    element.classList.add("match-card-enter");
    element.style.setProperty("--card-delay", `${Math.min(index * 24, 180)}ms`);
    section.appendChild(element);
  }
  return section;
}

function buildCatalogProgramSection(programs) {
  const section = document.createElement("div");
  section.className = "tier-section";
  const heading = document.createElement("h3");
  heading.className = "tier-heading";
  heading.innerHTML = `All summer programs <span class="tier-count">${programs.length}</span>`;
  section.appendChild(heading);
  for (const [index, program] of programs.entries()) {
    const element = buildProgramCard(program, { catalogContext: true });
    element.classList.add("match-card-enter");
    element.style.setProperty("--card-delay", `${Math.min(index * 24, 180)}ms`);
    section.appendChild(element);
  }
  return section;
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

function buildProgramCard(program, options = {}) {
  const programId = program.program_id || program.id;
  const specialRequirements =
    program.special_requirements || program.eligibility?.special_requirements || [];
  const requiresSpecialCheck =
    Boolean(program.requires_special_check) || specialRequirements.length > 0;
  const tierClass = options.catalogContext
    ? "catalog"
    : options.savedContext
    ? "saved"
    : requiresSpecialCheck
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

  if (requiresSpecialCheck) {
    const badges = document.createElement("div");
    badges.className = "badge-row";
    if (options.catalogContext) {
      badges.appendChild(makeBadge("Full catalog — not personalized", "badge-catalog"));
    }
    badges.appendChild(makeBadge("Special eligibility", "badge-special"));
    body.appendChild(badges);
  } else if (options.catalogContext) {
    const badges = document.createElement("div");
    badges.className = "badge-row";
    badges.appendChild(makeBadge("Full catalog — not personalized", "badge-catalog"));
    body.appendChild(badges);
  }

  if (specialRequirements.length > 0) {
    body.appendChild(buildSpecialRequirements(specialRequirements));
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
  link.textContent = requiresSpecialCheck ? "Check program page" : "View program";
  footer.appendChild(link);

  const adviceLoading = document.createElement("div");
  adviceLoading.className = "essay-advice-loading";
  adviceLoading.hidden = true;
  adviceLoading.innerHTML =
    '<div class="loading-spinner" aria-hidden="true"></div><p>Writing application advice for this program...</p>';

  const adviceError = document.createElement("div");
  adviceError.className = "essay-advice-error";
  adviceError.hidden = true;
  adviceError.setAttribute("role", "alert");

  const advicePanel = document.createElement("div");
  advicePanel.className = "essay-advice-panel";
  advicePanel.hidden = true;

  if (programId) {
    const actions = document.createElement("div");
    actions.className = "card-actions";
    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "btn-save";
    applySavedButtonState(saveBtn, savedProgramIds.has(programId));
    saveBtn.addEventListener("click", () => toggleSavedProgram(programId, saveBtn));
    actions.appendChild(saveBtn);

    const adviceBtn = document.createElement("button");
    adviceBtn.type = "button";
    adviceBtn.className = "btn-secondary";
    adviceBtn.textContent = "Get application advice";
    adviceBtn.addEventListener("click", () =>
      handleProgramAdvice(programId, adviceBtn, advicePanel, adviceLoading, adviceError)
    );
    actions.appendChild(adviceBtn);

    footer.appendChild(actions);
  }
  body.appendChild(footer);
  body.appendChild(adviceLoading);
  body.appendChild(adviceError);
  body.appendChild(advicePanel);

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
    description: scholarship.description,
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
  if (card.catalog_context) {
    badges.appendChild(makeBadge("Full catalog — not personalized", "badge-catalog"));
  }
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

async function handleProgramAdvice(programId, button, panel, loading, errorEl) {
  if (!lastSubmittedProfile) {
    errorEl.textContent =
      "Submit your profile first so application advice can use your current answers.";
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
    const response = await fetch("/program-advice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student: lastSubmittedProfile,
        program_id: programId,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      const message =
        data.detail?.error ||
        (typeof data.detail === "string" ? data.detail : null) ||
        "Application advice could not be loaded. Try again in a few minutes.";
      errorEl.textContent = message;
      errorEl.hidden = false;
      return;
    }

    panel.innerHTML = "";
    const heading = document.createElement("h5");
    heading.className = "essay-advice-heading";
    heading.textContent = "Application advice";
    const content = document.createElement("div");
    content.className = "essay-advice-content";
    content.textContent = data.advice;
    panel.appendChild(heading);
    panel.appendChild(content);
    panel.hidden = false;
  } catch (err) {
    errorEl.textContent =
      "Application advice could not be loaded. Check your connection and try again.";
    errorEl.hidden = false;
    console.error(err);
  } finally {
    loading.hidden = true;
    button.disabled = false;
  }
}
