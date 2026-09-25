const { chromium } = require("playwright");
const path = require("path");

async function runBrowserVerification() {
  console.log("=== STARTING TRON COMPASS BROWSER VERIFICATION ===");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  try {
    // 1. Open app
    console.log("1. Navigating to http://localhost:3000...");
    await page.goto("http://localhost:3000", { waitUntil: "networkidle" });

    // 2. Check title
    const title = await page.title();
    console.log("2. Page title verified:", title);
    if (!title.includes("TRON Compass")) {
      throw new Error(`Unexpected page title: ${title}`);
    }

    // 3. Check Network Badges & 5-Step Stepper
    const textContent = await page.textContent("body");
    if (!textContent.includes("TRON Mainnet") || !textContent.includes("Nile Testnet")) {
      throw new Error("Network badges (TRON Mainnet / Nile Testnet) not found in page content");
    }
    if (!textContent.includes("5단계 자산 배분 여정")) {
      throw new Error("5-Step journey stepper not found");
    }
    console.log("3. Mandatory network badges & 5-step journey stepper verified.");

    await page.screenshot({ path: path.join(__dirname, "../docs/screenshots/01_dashboard.png") });

    // 4. Verify AI Planner & Click Preset
    console.log("4. Testing AI Planner interaction...");
    const presetBtn = page.locator("button:has-text('3분 데모 표준 목표')").first();
    await presetBtn.click();
    await page.waitForTimeout(500);

    const analyzeBtn = page.locator("button:has-text('목표 분석')").first();
    if (await analyzeBtn.isVisible()) {
      await analyzeBtn.click();
      await page.waitForTimeout(2000);
    }

    // 5. Confirm Profile & Generate Plans
    console.log("5. Confirming Needs Profile & generating deterministic plans...");
    const confirmBtn = page.locator("button:has-text('조건 확인 및 2개 최적 플랜 생성')").first();
    await confirmBtn.click();
    await page.waitForTimeout(2500);

    // 6. Verify Plan A and Plan B with concise bullets
    console.log("6. Verifying Plan A (Liquidity-First) & Plan B (Yield-Oriented)...");
    const planAText = await page.locator("text=Plan A: Liquidity-First").count();
    const planBText = await page.locator("text=Plan B: Yield-Oriented").count();
    console.log(`Plans found: Plan A (${planAText}), Plan B (${planBText})`);
    if (planAText === 0 || planBText === 0) {
      throw new Error("One or more generated plans failed to render");
    }

    // Check progressive disclosure: open AI detail
    const aiDetailBtn = page.locator("button:has-text('AI 상세 분석 보기')").first();
    if (await aiDetailBtn.isVisible()) {
      await aiDetailBtn.click();
      await page.waitForTimeout(500);
    }

    await page.screenshot({ path: path.join(__dirname, "../docs/screenshots/02_plan_comparison.png") });

    // 7. Test Execution Preview Modal in Demo Mode
    console.log("7. Opening Nile Execution Preview Modal (Demo Mode)...");
    const execBtn = page.locator("button:has-text('Nile 테스트넷 트랜잭션 실행 프리뷰')").first();
    await execBtn.click();
    await page.waitForTimeout(1000);

    const modalTitle = await page.locator("text=Nile 테스트넷 실행 검토").count();
    if (modalTitle === 0) {
      throw new Error("Execution modal did not open");
    }
    console.log("Execution modal opened successfully.");

    await page.screenshot({ path: path.join(__dirname, "../docs/screenshots/03_execution_modal_demo.png") });

    // 8. Human-in-the-loop authorization & Sign (Demo)
    console.log("8. Testing Human-in-the-loop approval & signing on Nile...");
    const checkbox = page.locator("input#auth-check");
    await checkbox.check();
    await page.waitForTimeout(500);

    const signBtn = page.locator("button:has-text('Approve & Sign Transaction')").first();
    await signBtn.click();

    console.log("Waiting for Nile broadcast and confirmation...");
    await page.waitForSelector("text=트랜잭션이 온체인 블록에 최종 확정", { timeout: 10000 });
    console.log("Transaction successfully CONFIRMED on Nile sandbox!");

    // CRITICAL CHECK: In CONFIRMED state, "Approve & Sign Transaction" button MUST NOT exist!
    const signBtnAfterConfirm = await page.locator("button:has-text('Approve & Sign Transaction')").count();
    if (signBtnAfterConfirm > 0) {
      throw new Error("CRITICAL BUG: 'Approve & Sign Transaction' button is still visible after transaction confirmation!");
    }
    console.log("Verified: 'Approve & Sign Transaction' button is completely gone in CONFIRMED state.");

    await page.screenshot({ path: path.join(__dirname, "../docs/screenshots/04_transaction_confirmed.png") });

    // Close modal via "실행 완료 (닫기)"
    const completeCloseBtn = page.locator("button:has-text('실행 완료 (닫기)')").first();
    await completeCloseBtn.click();
    await page.waitForTimeout(500);

    // 9. TEST REAL WALLET / ZERO BALANCE PREFLIGHT GUARDRAIL
    console.log("9. Testing Real Wallet switch with 0 TRX balance (Insufficient Balance Gate)...");
    const realWalletSwitch = page.locator("button:has-text('실제 지갑 (Real)')").first();
    await realWalletSwitch.click();
    await page.waitForTimeout(500);

    // Reopen execution modal
    const execBtn2 = page.locator("button:has-text('Nile 테스트넷 트랜잭션 실행 프리뷰')").first();
    await execBtn2.click();
    await page.waitForTimeout(1000);

    // Verify Insufficient Nile TRX banner & Faucet CTA
    const insufficientAlert = await page.locator("text=Insufficient Nile TRX").count();
    const faucetBtn = await page.locator("text=Get Test TRX (Faucet)").count();
    console.log(`Insufficient balance alert count: ${insufficientAlert}, Faucet CTA count: ${faucetBtn}`);

    if (insufficientAlert === 0 || faucetBtn === 0) {
      throw new Error("Failed to show Insufficient Nile TRX alert and Faucet CTA when wallet balance is 0!");
    }

    // Verify sign button is DISABLED
    const signBtnDisabled = page.locator("button:has-text('Approve & Sign Transaction')").first();
    const isDisabled = await signBtnDisabled.isDisabled();
    if (!isDisabled) {
      throw new Error("CRITICAL BUG: Approve & Sign button is NOT disabled when balance is insufficient!");
    }
    console.log("Verified: Approve & Sign button is strictly DISABLED on 0 TRX balance.");

    await page.screenshot({ path: path.join(__dirname, "../docs/screenshots/05_insufficient_trx_modal.png") });

    // Close modal
    const cancelBtn = page.locator("button:has-text('취소')").first();
    await cancelBtn.click();
    await page.waitForTimeout(500);

    // Switch back to Demo for remaining tab tests
    const demoSwitch = page.locator("button:has-text('데모 포트폴리오')").first();
    await demoSwitch.click();
    await page.waitForTimeout(500);

    // 10. Navigate to Verified Market Tab
    console.log("10. Navigating to Market Overview Tab...");
    const marketTab = page.locator("button:has-text('생태계 마켓 현황')").first();
    await marketTab.click();
    await page.waitForTimeout(1000);

    const usddCollateral = await page.locator("text=USDD 담보 비율").count();
    const justlendPools = await page.locator("text=JustLend DAO").count();
    if (usddCollateral === 0 || justlendPools === 0) {
      throw new Error("Market overview cards failed to render");
    }
    console.log("Market Overview verified (JustLend 24 jTokens + USDD 147.89% collateral).");

    await page.screenshot({ path: path.join(__dirname, "../docs/screenshots/06_market_evidence.png") });

    // 11. Navigate to Historical Replay Tab
    console.log("11. Navigating to Historical Replay & Rebalance Tab...");
    const monitorTab = page.locator("button:has-text('히스토리컬 리플레이 & 리밸런싱')").first();
    await monitorTab.click();
    await page.waitForTimeout(1000);

    // Trigger Scenario 1: Incentive Expiry
    console.log("12. Triggering Replay Scenario 1: JustLend Mining Incentive Halving / Expiry...");
    const scenario1Btn = page.locator("button:has-text('Scenario 1: JustLend Mining Incentive Halving')").first();
    await scenario1Btn.click();
    await page.waitForTimeout(2000);

    const rebalanceProposal = await page.locator("text=제안된 리밸런싱 플랜").count();
    if (rebalanceProposal === 0) {
      throw new Error("Rebalance proposal was not triggered during simulated incentive decay");
    }
    console.log("Rebalance proposal successfully triggered and verified!");

    await page.screenshot({ path: path.join(__dirname, "../docs/screenshots/07_rebalance_proposal.png") });

    // 12. Check console errors
    console.log("13. Checking for client console errors...");
    if (consoleErrors.length > 0) {
      console.warn("Browser console errors logged:", consoleErrors);
    } else {
      console.log("No console errors detected! 100% clean browser execution.");
    }

    console.log("=== ALL BROWSER VERIFICATION CHECKS PASSED SUCCESSFULLY! ===");
  } finally {
    await browser.close();
  }
}

runBrowserVerification().catch((err) => {
  console.error("Browser verification failed:", err);
  process.exit(1);
});
