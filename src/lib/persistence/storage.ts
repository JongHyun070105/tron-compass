import { AllocationPlan, NeedsProfile, YieldOpportunity } from "@/domain/allocation/types";

export interface SavedPlanRecord {
  id: string;
  walletAddress: string;
  createdAt: string;
  plan: AllocationPlan;
  profile: NeedsProfile;
  marketSnapshot: YieldOpportunity[];
}

export type CompassDataScope =
  | "DEMO"
  | "LIVE_NILE"
  | "LIVE_MAINNET"
  | "SIMULATED_REPLAY";

export interface ExecutionRecord {
  id: string;
  planId: string;
  walletAddress: string;
  txHash: string;
  asset: string;
  amount: string;
  targetContract: string;
  network: "NILE";
  dataScope: CompassDataScope;
  isDemo?: boolean;
  status: "BROADCASTED" | "CONFIRMED" | "FAILED";
  timestamp: string;
}

export interface RebalanceLogRecord {
  id: string;
  planId: string;
  walletAddress: string;
  triggerReason: string;
  marketDeltaSummary: string;
  proposedPlan: AllocationPlan;
  timestamp: string;
}

const STORAGE_KEY_PLANS = "tron_compass_saved_plans_v1";
const STORAGE_KEY_EXECUTIONS = "tron_compass_executions_v1";
const STORAGE_KEY_REBALANCE = "tron_compass_rebalance_logs_v1";

class CompassStorageService {
  private memoryPlans: Map<string, SavedPlanRecord> = new Map();
  private memoryExecutions: Map<string, ExecutionRecord> = new Map();
  private memoryRebalanceLogs: Map<string, RebalanceLogRecord> = new Map();

  private isBrowser(): boolean {
    return typeof window !== "undefined" && typeof localStorage !== "undefined";
  }

  // --- Plans ---
  async savePlan(record: SavedPlanRecord): Promise<void> {
    this.memoryPlans.set(record.id, record);
    if (this.isBrowser()) {
      try {
        const existing = await this.getAllPlans();
        const updated = [record, ...existing.filter((p) => p.id !== record.id)];
        localStorage.setItem(STORAGE_KEY_PLANS, JSON.stringify(updated));
      } catch (err) {
        console.warn("Storage savePlan error:", err);
      }
    }
  }

  async getAllPlans(): Promise<SavedPlanRecord[]> {
    if (this.isBrowser()) {
      try {
        const raw = localStorage.getItem(STORAGE_KEY_PLANS);
        if (raw) return JSON.parse(raw);
      } catch {
        // Fallback to memory
      }
    }
    return Array.from(this.memoryPlans.values());
  }

  async getPlanById(id: string): Promise<SavedPlanRecord | null> {
    const plans = await this.getAllPlans();
    return plans.find((p) => p.id === id) || this.memoryPlans.get(id) || null;
  }

  // --- Executions ---
  async recordExecution(record: ExecutionRecord): Promise<void> {
    this.memoryExecutions.set(record.id, record);
    if (this.isBrowser()) {
      try {
        const existing = await this.getAllExecutions();
        const updated = [record, ...existing.filter((e) => e.id !== record.id)];
        localStorage.setItem(STORAGE_KEY_EXECUTIONS, JSON.stringify(updated));
      } catch (err) {
        console.warn("Storage recordExecution error:", err);
      }
    }
  }

  async getAllExecutions(): Promise<ExecutionRecord[]> {
    if (this.isBrowser()) {
      try {
        const raw = localStorage.getItem(STORAGE_KEY_EXECUTIONS);
        if (raw) return JSON.parse(raw);
      } catch {
        // Fallback to memory
      }
    }
    return Array.from(this.memoryExecutions.values());
  }

  async getExecutions(params: {
    walletAddress?: string;
    dataScope?: CompassDataScope;
    isDemo?: boolean;
  }): Promise<ExecutionRecord[]> {
    const all = await this.getAllExecutions();
    return all.filter((e) => {
      if (params.walletAddress && e.walletAddress !== params.walletAddress) {
        return false;
      }
      if (params.dataScope && e.dataScope !== params.dataScope) {
        return false;
      }
      if (typeof params.isDemo === "boolean" && Boolean(e.isDemo) !== params.isDemo) {
        return false;
      }
      return true;
    });
  }

  async clearDemoExecutions(): Promise<void> {
    const all = await this.getAllExecutions();
    const realOnly = all.filter((e) => !e.isDemo && e.dataScope !== "DEMO");
    this.memoryExecutions.clear();
    for (const r of realOnly) {
      this.memoryExecutions.set(r.id, r);
    }
    if (this.isBrowser()) {
      localStorage.setItem(STORAGE_KEY_EXECUTIONS, JSON.stringify(realOnly));
    }
  }

  // --- Rebalance Logs ---
  async recordRebalance(record: RebalanceLogRecord): Promise<void> {
    this.memoryRebalanceLogs.set(record.id, record);
    if (this.isBrowser()) {
      try {
        const existing = await this.getAllRebalanceLogs();
        const updated = [record, ...existing.filter((r) => r.id !== record.id)];
        localStorage.setItem(STORAGE_KEY_REBALANCE, JSON.stringify(updated));
      } catch (err) {
        console.warn("Storage recordRebalance error:", err);
      }
    }
  }

  async getAllRebalanceLogs(): Promise<RebalanceLogRecord[]> {
    if (this.isBrowser()) {
      try {
        const raw = localStorage.getItem(STORAGE_KEY_REBALANCE);
        if (raw) return JSON.parse(raw);
      } catch {
        // Fallback to memory
      }
    }
    return Array.from(this.memoryRebalanceLogs.values());
  }

  // Clear demo data
  async clearAll(): Promise<void> {
    this.memoryPlans.clear();
    this.memoryExecutions.clear();
    this.memoryRebalanceLogs.clear();
    if (this.isBrowser()) {
      localStorage.removeItem(STORAGE_KEY_PLANS);
      localStorage.removeItem(STORAGE_KEY_EXECUTIONS);
      localStorage.removeItem(STORAGE_KEY_REBALANCE);
    }
  }
}

export const compassStorage = new CompassStorageService();
