/**
 * Every English string in the product. Zero hardcoded text in components -
 * standing architectural law (PRD 5.11, 12).
 *
 * strings.ar.ts is typed against this object, so a missing Arabic translation
 * is a compile error rather than an English word leaking into an Arabic shift.
 */

export const en = {
  app: {
    title: "OFM Logistics Academy",
    subtitle: "The Mill",
    tagline: "Every job in this company is logistics. Learn the whole chain.",
    org: "Oman Flour Mills — Feed Mills",
  },

  nav: {
    chapters: "Chapters",
    back: "Back",
    replay: "Replay",
    retry: "Retry",
    next: "Next",
    finish: "Finish",
    close: "Close",
    language: "العربية",
  },

  hud: {
    ledger: "Ledger",
    omr: "OMR",
    time: "Time",
    omanTime: "Oman",
    millDay: "Mill day",
    ghostHour: "Ghost hour — this posts to the previous production day",
    progress: "Progress",
  },

  chapter: {
    ch0: "Welcome to the Mill",
    ch1: "The Order",
    ch2: "The Mill Floor",
    ch3: "The Bag",
    ch4: "The Warehouse",
    ch5: "The Yard",
    ch6: "The Road",
    ch7: "Receiving",
    ch8: "The Shift",
    ch9: "The Full Shift",
    locked: "Finish the chapter before this one to unlock",
    comingSoon: "Not built yet",
  },

  level: {
    start: "Start",
    objective: "Objective",
    timeLeft: "Time left",
    score: "Score",
    stars: "Stars",
    accuracy: "Accuracy",
    speed: "Speed",
    cost: "Cost",
    safety: "Safety",
    passed: "Passed",
    failed: "Not passed",
    consequence: "What this costs",
    whatHappened: "What happened",
    tryAgain: "Run it again",
  },

  l0_2: {
    title: "The Language of the Mill",
    objective: "Match each term to its Arabic name. Thirty words the whole chain uses.",
    prompt: "Tap the matching term",
    correct: "Matched",
    wrong: "Not that one",
    remaining: "Remaining",
  },

  l1_1: {
    title: "Read the SO",
    objective: "Pull the five fields off the Sales Order: customer, product code, tonnes, bags, deadline.",
    fieldCustomer: "Customer",
    fieldProduct: "Product code",
    fieldMt: "Quantity (MT)",
    fieldBags: "Bags",
    fieldDeadline: "Deadline",
    tapToFill: "Tap a value below, then the slot it belongs in",
    slotEmpty: "empty",
    docTitle: "SALES ORDER",
    docNote: "Layout is a placeholder until an anonymised SO PDF is supplied.",
  },

  l1_2: {
    title: "Code Breaker",
    objective: "Match the Bühler code to the product. These sixteen are the codes the department works with daily.",
    prompt: "Which code did the order ask for?",
    hint: "716 is not 715. Read the digits, not the shape.",
  },

  l1_3: {
    title: "MT to Bags",
    objective: "One tonne is forty bags of 25 kg. Convert until it is reflex.",
    promptToBags: "How many bags in {mt} MT?",
    promptToMt: "How many MT in {bags} bags?",
    unitBags: "bags",
    unitMt: "MT",
    streak: "Streak",
  },

  l1_4: {
    title: "The Deadline",
    objective: "Order these four by real urgency, not by the order they arrived.",
    prompt: "Drag to reorder, then commit",
    commit: "Commit the queue",
    ferryNote: "Ferry leg",
    transitNote: "Transit",
  },

  l1_5: {
    title: "The Ghost SO",
    objective: "The dispatch inbox references eight orders. The list shows seven. Find the missing one and report it.",
    prompt: "Which order is missing from the list?",
    report: "Report the system bug",
    reported: "Reported — this is the scored correct answer, not an extra",
    inbox: "Dispatch inbox",
    list: "SO list",
  },

  l3_2: {
    title: "The Scale",
    objective: "Hold every bag at 25.0 kg. The needle drifts; stop it on the mark.",
    prompt: "Tap STOP at 25.0 kg",
    stop: "STOP",
    bag: "Bag",
    deviation: "Average deviation",
    thisBag: "This bag",
    grams: "g",
  },

  l3_3: {
    title: "400 Free Kilos",
    objective: "Pick the line setting for this run. Faster is not cheaper.",
    prompt: "Set the target bag weight",
    throughput: "Throughput",
    giveaway: "Given away",
    perTruck: "This truck",
    perYear: "At this rate, per year",
    run: "Run the truck",
    reveal: "Everything looked fine. Here is what left the site free.",
    bagsFilled: "Bags filled",
  },

  l6_1: {
    title: "Bagged or Bulk?",
    objective: "Cargo form decides the truck. Not the customer, not the price.",
    prompt: "This load is",
    pickTruck: "Which truck do you book?",
    flatbed: "Flat Bed 40 ft",
    tipper: "Tipper",
    bagged: "Bagged, 25 kg",
    bulk: "Bulk",
  },

  l6_3: {
    title: "The Contract Board",
    objective: "Send each order to a transporter that actually holds the contract.",
    prompt: "Who carries this one?",
    rate: "Rate",
    noRate: "per MT",
    escalate: "NO CONTRACT — escalate",
  },

  l6_4: {
    title: "Sohar Poultry",
    objective: "Two carriers serve Sohar Poultry. Only one can carry this load.",
    cargo: "Cargo",
    premixBags: "Premix, 25 kg bags",
    trap: "One is cheaper on paper. Read the cargo form before the rate.",
  },

  l6_6: {
    title: "No Contract",
    objective: "An unlisted route lands in your inbox. Decide what to do with it.",
    prompt: "This route is not on the contract board",
    improvise: "Book it anyway at a guessed rate",
    escalateNow: "Flag NO CONTRACT — handle manually",
  },

  l6_7: {
    title: "The Ferry",
    objective: "Masirah is reached via the Shannah ferry. Transit is not distance.",
    prompt: "Which departure gets the load there in time?",
    ferryAt: "Ferry departs",
    arriveBy: "Customer needs it by",
    driveTime: "Drive to Shannah",
    missed: "Missed the ferry",
  },

  l8_2: {
    title: "Labour Forecast",
    objective: "Today's real orders, not an average. Open the right number of belts and set the crew.",
    belts: "Belts open",
    bays: "Bays open",
    crew: "Crew",
    ordersToday: "Confirmed orders today",
    day: "Day",
    night: "Night",
    forecast: "Forecast",
    commit: "Commit the plan",
    idle: "Idle labour",
    waiting: "Trucks waiting",
    target: "The SLS output format",
  },

  l8_5: {
    title: "The Leave Chain",
    objective: "Someone is on leave. Cover the exact shift, from the opposite team only.",
    onLeave: "On leave",
    pickCover: "Pick the replacement",
    teamA: "Team A",
    teamB: "Team B",
    chainPreview: "Chain preview",
    coverage: "Coverage",
    gap: "Gap",
    confirm: "Confirm the chain",
    sameTeam: "Same-team cover is not allowed",
  },

  l8_6: {
    title: "The Ghost Hour",
    objective: "Post this load so it lands on the right production day.",
    postAt: "Post the load at",
    omanClock: "Oman",
    millClock: "Mill production day",
    willFileOn: "This will file on production day",
    today: "today",
    yesterday: "yesterday",
    post: "Post the load",
    waitUntil: "Wait until after the rollover",
    rollover: "Production day rolls over at",
  },

  result: {
    title: "Shift report",
    omrNet: "Net OMR",
    omrLost: "Lost",
    omrEarned: "Earned",
    breakdown: "Where the money went",
    noCost: "Nothing lost — clean run",
    replaySaved: "Replay saved",
    replaySize: "{bytes} bytes",
  },

  reason: {
    wrong_product: "Wrong product loaded",
    wrong_truck_type: "Wrong truck type booked",
    out_of_scope_route: "Route outside your scope",
    no_contract_escalated: "Escalated correctly",
    fifo_breach: "FIFO breach",
    stock_written_off: "Stock written off",
    overfill: "Overfill",
    idle_labour: "Idle labour",
    truck_waiting: "Truck waiting",
    missing_document: "Missing document",
    deadline_missed: "Deadline missed",
    ferry_missed: "Ferry missed",
    day_boundary_misposted: "Posted to the wrong production day",
    unsafe_act: "Unsafe act",
    correct_call: "Correct call",
    on_time_delivery: "Delivered on time",
    under_budget: "Under budget",
  },

  confirm: {
    badge: "TODO_CONFIRM",
    title: "Unconfirmed value",
    body: "This value is a placeholder. It is shown so nobody mistakes it for OFM fact, and it changes in one place once confirmed.",
    productNames: "Product names and ERP codes await the Smart Fleet v5.1 export. Codes shown are the confirmed Bühler codes.",
    millTz: "The Bühler timezone offset is modelled as a fixed CET offset. Whether it shifts with European DST is unconfirmed.",
  },
};

/**
 * The shape of the copy, with values widened to string. Without this the
 * `en` literals would become the required type and every Arabic translation
 * would fail to assign.
 */
export type Strings = typeof en;
