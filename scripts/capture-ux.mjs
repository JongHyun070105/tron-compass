import { chromium } from "playwright";
import fs from "fs";
import path from "path";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  console.log("Navigating to http://localhost:3000...");
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  // 1. Landing & Portfolio Hero & Journey Stepper
  console.log("Capturing 01_landing_hero_and_journey.png...");
  await page.screenshot({
    path: "docs/screenshots/01_landing_hero_and_journey.png",
    fullPage: false,
  });

  // 2. Scroll to Plan Comparison
  console.log("Capturing 02_plan_comparison_cards.png...");
  await page.evaluate(() => window.scrollBy(0, 650));
  await page.waitForTimeout(800);
  await page.screenshot({
    path: "docs/screenshots/02_plan_comparison_cards.png",
    fullPage: false,
  });

  // 3. Open Execution Modal
  console.log("Capturing 04_execution_modal.png...");
  const execButton = page.locator("button:has-text('이 플랜으로 실행 검토하기')").first();
  if (await execButton.isVisible()) {
    await execButton.click();
    await page.waitForTimeout(600);
    await page.screenshot({
      path: "docs/screenshots/04_execution_modal.png",
    });
    // Close modal
    await page.locator("button:has-text('취소')").click();
    await page.waitForTimeout(500);
  }

  // 4. Switch to Market Tab
  console.log("Capturing 03_market_overview.png...");
  await page.locator("button:has-text('생태계 마켓 현황')").click();
  await page.waitForTimeout(800);
  await page.screenshot({
    path: "docs/screenshots/03_market_overview.png",
    fullPage: false,
  });

  // 5. Switch to Replay Monitor Tab
  console.log("Capturing 05_replay_monitor.png...");
  await page.locator("button:has-text('모의 리플레이 & 모니터링')").click();
  await page.waitForTimeout(800);
  await page.screenshot({
    path: "docs/screenshots/05_replay_monitor.png",
    fullPage: false,
  });

  await browser.close();
  console.log("All screenshots captured successfully!");
}

main().catch((err) => {
  console.error("Screenshot error:", err);
  process.exit(1);
});
