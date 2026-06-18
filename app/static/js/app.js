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

const form = document.getElementById("profile-form");
const formError = document.getElementById("form-error");
const resultsSection = document.getElementById("results-section");
const resultsContainer = document.getElementById("results-container");
const resultsSummary = document.getElementById("results-summary");
const resultsEmpty = document.getElementById("results-empty");
const loadingEl = document.getElementById("loading");
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
const filterDemographicMatch = document.getElementById("filter-demographic-match");
const filterClear = document.getElementById("filter-clear");

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
  wireAuthControls();
  wireFilterControls();
  await loadSession();
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
  filterDemographicMatch.addEventListener("change", rerenderResults);
  filterClear.addEventListener("click", resetFilters);
}

function resetFilters() {
  filterQuality.value = "all";
  filterSort.value = "fit";
  filterMinScore.value = "0";
  filterMinScoreValue.textContent = "0";
  filterNoEssay.checked = false;
  filterFieldMatch.checked = false;
  filterDemographicMatch.checked = false;
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
    if (quality !== "all" && r.match_tier !== quality) {
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
    if (filterDemographicMatch.checked && (r.score_breakdown?.demographics ?? 0) <= 0) {
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
    default:
      // "fit": preserve the server's score/deadline/name ordering.
      break;
  }
  return sorted;
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
}

function setValue(elementId, value) {
  const el = document.getElementById(elementId);
  if (el && value !== undefined && value !== null) {
    el.value = value;
  }
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

function renderSaved(items) {
  savedContainer.innerHTML = "";
  if (!items || items.length === 0) {
    savedSummary.textContent = "";
    savedEmpty.hidden = false;
    return;
  }
  savedEmpty.hidden = true;
  savedSummary.textContent = `${items.length} saved scholarship${items.length === 1 ? "" : "s"}.`;

  for (const item of items) {
    if (!item.scholarship) {
      continue;
    }
    const card = buildCard(scholarshipToCard(item.scholarship), "strong");
    savedContainer.appendChild(card);
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

    label.appendChild(input);
    label.appendChild(document.createTextNode(opt.label));
    container.appendChild(label);
  }
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
  const strong = filtered.filter((r) => r.match_tier === "strong");
  const possible = filtered.filter((r) => r.match_tier === "possible");

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
}

function buildTierSection(title, matches, tierClass) {
  const section = document.createElement("div");
  section.className = "tier-section";

  const heading = document.createElement("h3");
  heading.className = `tier-heading ${tierClass === "possible" ? "possible" : ""}`;
  heading.textContent = title;
  section.appendChild(heading);

  for (const match of matches) {
    section.appendChild(buildCard(matchToCard(match), tierClass));
  }

  return section;
}

function matchToCard(match) {
  return {
    scholarship_id: match.scholarship_id,
    name: match.scholarship_name,
    sponsor: match.sponsor,
    award_amount: match.award_amount,
    deadline: match.deadline,
    url: match.url,
    verified: match.verified,
    closing_soon: match.closing_soon,
    score: match.score,
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
    url: scholarship.url,
    verified: scholarship.verified,
    closing_soon: computeClosingSoon(scholarship.deadline),
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

function buildCard(card, tierClass) {
  const article = document.createElement("article");
  article.className = `match-card ${tierClass}`;

  const pathBar = document.createElement("div");
  pathBar.className = "path-bar";
  pathBar.setAttribute("aria-hidden", "true");

  const body = document.createElement("div");
  body.className = "card-body";

  const top = document.createElement("div");
  top.className = "card-top";

  const title = document.createElement("h4");
  title.className = "card-title";
  title.textContent = card.name;
  top.appendChild(title);

  if (typeof card.score === "number") {
    const score = document.createElement("span");
    score.className = "card-score";
    score.textContent = `Fit score: ${card.score}`;
    top.appendChild(score);
  }

  const meta = document.createElement("dl");
  meta.className = "card-meta";
  meta.innerHTML = `
    <div><dt>Sponsor</dt><dd>${escapeHtml(card.sponsor)}</dd></div>
    <div><dt>Award</dt><dd>${escapeHtml(formatAward(card.award_amount))}</dd></div>
    <div><dt>Deadline</dt><dd>${escapeHtml(formatDeadline(card.deadline))}</dd></div>
  `;

  const badges = document.createElement("div");
  badges.className = "badge-row";
  if (card.closing_soon) {
    badges.appendChild(makeBadge("Closing soon", "badge-closing"));
  }
  if (!card.verified) {
    badges.appendChild(makeBadge("Unverified data", "badge-unverified"));
  }

  body.appendChild(top);
  body.appendChild(meta);
  if (badges.childElementCount > 0) {
    body.appendChild(badges);
  }

  if (card.match_reasons && card.match_reasons.length > 0) {
    const reasons = document.createElement("div");
    reasons.className = "reasons";
    const details = document.createElement("details");
    details.open = true;
    const summary = document.createElement("summary");
    summary.textContent = "Why this matched";
    const list = document.createElement("ul");
    for (const reason of card.match_reasons) {
      const li = document.createElement("li");
      li.textContent = reason;
      list.appendChild(li);
    }
    details.appendChild(summary);
    details.appendChild(list);
    reasons.appendChild(details);
    body.appendChild(reasons);
  }

  const link = document.createElement("a");
  link.className = "card-link";
  link.href = card.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "View and apply";
  body.appendChild(link);

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

  body.appendChild(actions);
  body.appendChild(adviceLoading);
  body.appendChild(adviceError);
  body.appendChild(advicePanel);

  article.appendChild(pathBar);
  article.appendChild(body);
  return article;
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

function formatDeadline(deadline) {
  if (deadline === "rolling") {
    return "Rolling";
  }
  if (deadline === "VERIFY" || String(deadline).startsWith("VERIFY")) {
    return "Confirm on sponsor site";
  }
  return deadline;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

async function handleEssayAdvice(scholarshipId, button, panel, loading, errorEl) {
  if (!lastSubmittedProfile) {
    errorEl.textContent =
      "Submit your profile first so essay advice can use your current answers.";
    errorEl.hidden = false;
    panel.hidden = true;
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
