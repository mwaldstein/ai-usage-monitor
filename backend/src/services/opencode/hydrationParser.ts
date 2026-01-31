import { logger } from "../../utils/logger.ts";

// Types
export interface OpenCodeBillingData {
  customerID: string;
  balance: number;
  monthlyLimit: number | null;
  monthlyUsage: number;
  timeMonthlyUsageUpdated: string;
  subscription: {
    plan: string;
    seats: number;
    status: string;
  };
  subscriptionID: string;
}

export interface OpenCodeSubscriptionData {
  plan: string;
  useBalance: boolean;
  rollingUsage: {
    status: string;
    resetInSec: number;
    usagePercent: number;
  } | null;
  weeklyUsage: {
    status: string;
    resetInSec: number;
    usagePercent: number;
  } | null;
}

export interface OpenCodeRollingUsage {
  status: string;
  resetInSec: number;
  usagePercent: number;
}

export interface OpenCodeWeeklyUsage {
  status: string;
  resetInSec: number;
  usagePercent: number;
}

export interface ParsedHydrationData {
  billing?: OpenCodeBillingData;
  subscription?: OpenCodeSubscriptionData;
  rollingUsage?: OpenCodeRollingUsage;
  weeklyUsage?: OpenCodeWeeklyUsage;
}

// Parsing result for strategy pattern
interface StrategyResult {
  billing?: OpenCodeBillingData;
  subscription?: OpenCodeSubscriptionData;
  rollingUsage?: OpenCodeRollingUsage;
  weeklyUsage?: OpenCodeWeeklyUsage;
}

type ParsingStrategy = (html: string) => StrategyResult;

// Utility: Replace nested $R references with null or date strings
function replaceNestedR(dataStr: string): string {
  const result: string[] = [];
  let i = 0;

  while (i < dataStr.length) {
    const rObjectMatch = dataStr.slice(i).match(/^\$R\[\d+\]=\{/);
    if (rObjectMatch) {
      let braceCount = 1;
      let j = i + rObjectMatch[0].length;
      while (braceCount > 0 && j < dataStr.length) {
        if (dataStr[j] === "{") braceCount++;
        else if (dataStr[j] === "}") braceCount--;
        j++;
      }
      result.push("null");
      i = j;
      continue;
    }

    const rDateMatch = dataStr.slice(i).match(/^\$R\[\d+\]=new Date\("([^"]*)"\)/);
    if (rDateMatch) {
      result.push(`"${rDateMatch[1]}"`);
      i += rDateMatch[0].length;
      continue;
    }

    result.push(dataStr[i]);
    i++;
  }

  return result.join("");
}

// Parse object directly without $R prefix
function parseDirectObject(objStr: string): unknown {
  try {
    let dataStr = objStr;
    dataStr = replaceNestedR(dataStr);

    if (dataStr.match(/[,{]\s*\w+$/)) {
      dataStr = dataStr.replace(/[,{]\s*\w+$/, "");
    }

    dataStr = dataStr.replace(/\.\.\./g, "");

    if (!dataStr.endsWith("}")) {
      dataStr += "}";
    }

    const jsonStr = dataStr
      .replace(/([{,])\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":')
      .replace(/:!0/g, ":true")
      .replace(/:!1/g, ":false")
      .replace(/:([a-zA-Z_$][a-zA-Z0-9_$]*)/g, (match, p1) => {
        if (["null", "true", "false"].includes(p1)) return match;
        return `:"${p1}"`;
      });

    return JSON.parse(jsonStr);
  } catch (e) {
    logger.error({ data: objStr.substring(0, 150) }, "Failed to parse direct object");
    logger.error({ err: e }, "Error");
    return null;
  }
}

// Parse object with $R[index]= prefix
function parseObject(objStr: string): unknown {
  try {
    const dataStr = objStr.replace(/^\$R\[\d+\]=/, "");
    return parseDirectObject(dataStr);
  } catch (e) {
    logger.error({ data: objStr.substring(0, 150) }, "Failed to parse object");
    logger.error({ err: e }, "Error");
    return null;
  }
}

// Strategy 1: Look for $R[22]($R[X],$R[Y]={...}) patterns (SolidJS hydration calls)
const strategySolidJsHydration: ParsingStrategy = (html) => {
  const result: StrategyResult = {};
  const allCalls = html.match(/\$R\[22\]\(\$R\[(\d+)\],\$R\[(\d+)\]=\{/g);

  if (allCalls) {
    for (const call of allCalls) {
      const dataIndexMatch = call.match(/\$R\[(\d+)\]=\{$/);
      if (dataIndexMatch) {
        const dataIndex = dataIndexMatch[1];
        const startPattern = new RegExp(`\\$R\\[${dataIndex}\\]=\\{`);
        const startMatch = html.match(startPattern);

        if (startMatch) {
          const startIdx = startMatch.index!;
          let braceCount = 1;
          let endIdx = startIdx + startMatch[0].length;

          while (braceCount > 0 && endIdx < html.length) {
            if (html[endIdx] === "{") braceCount++;
            else if (html[endIdx] === "}") braceCount--;
            endIdx++;
          }

          const dataStr = html.substring(startIdx, endIdx);

          if (dataStr.includes("customerID")) {
            const parsed = parseObject(dataStr);
            if (parsed) {
              result.billing = parsed as OpenCodeBillingData;
            }
          }

          if (
            dataStr.includes("rollingUsage") ||
            dataStr.includes("weeklyUsage") ||
            dataStr.includes("plan")
          ) {
            const parsed = parseObject(dataStr);
            if (parsed && (parsed as OpenCodeSubscriptionData).plan) {
              result.subscription = parsed as OpenCodeSubscriptionData;
            }
          }
        }
      }
    }
  }

  return result;
};

// Strategy 2: Direct pattern matching for billing data with customerID
const strategyBillingPattern: ParsingStrategy = (html) => {
  const result: StrategyResult = {};
  const billingObjects = html.match(/\$R\[\d+\]=\{customerID:[^}]+\}/g);

  if (billingObjects) {
    for (const obj of billingObjects) {
      const parsed = parseObject(obj);
      if (parsed && (parsed as OpenCodeBillingData).customerID) {
        result.billing = parsed as OpenCodeBillingData;
        break;
      }
    }
  }

  return result;
};

// Strategy 3: Look for subscription data with plan
const strategySubscriptionPattern: ParsingStrategy = (html) => {
  const result: StrategyResult = {};
  const subObjects = html.match(/\$R\[\d+\]=\{[^}]*plan:[^}]*\}/g);

  if (subObjects) {
    for (const obj of subObjects) {
      const parsed = parseObject(obj);
      if (parsed && (parsed as OpenCodeSubscriptionData).plan) {
        result.subscription = parsed as OpenCodeSubscriptionData;
        break;
      }
    }
  }

  return result;
};

// Strategy 4: Extract rolling and weekly usage from combined subscription object
const strategyUsageFromSubscription: ParsingStrategy = (html) => {
  const result: StrategyResult = {};
  const subWithUsage = html.match(
    /\$R\[\d+\]=\{[^}]*plan:[^}]*rollingUsage:\$R\[\d+\]=\{[^}]*\}[^}]*weeklyUsage:\$R\[\d+\]=\{[^}]*\}[^}]*\}/,
  );

  if (subWithUsage) {
    const rollingMatch = subWithUsage[0].match(
      /rollingUsage:\$R\[\d+\]=(\{status:"[^"]+",resetInSec:\d+,usagePercent:\d+\})/,
    );
    if (rollingMatch) {
      const rollingStr = rollingMatch[1];
      const parsed = parseDirectObject(rollingStr);
      if (
        parsed &&
        (parsed as OpenCodeRollingUsage).status &&
        (parsed as OpenCodeRollingUsage).usagePercent !== undefined
      ) {
        result.rollingUsage = {
          status: (parsed as OpenCodeRollingUsage).status,
          resetInSec: parseInt(String((parsed as OpenCodeRollingUsage).resetInSec)),
          usagePercent: parseInt(String((parsed as OpenCodeRollingUsage).usagePercent)),
        };
      }
    }

    const weeklyMatch = subWithUsage[0].match(
      /weeklyUsage:\$R\[\d+\]=(\{status:"[^"]+",resetInSec:\d+,usagePercent:\d+\})/,
    );
    if (weeklyMatch) {
      const weeklyStr = weeklyMatch[1];
      const parsed = parseDirectObject(weeklyStr);
      if (
        parsed &&
        (parsed as OpenCodeWeeklyUsage).status &&
        (parsed as OpenCodeWeeklyUsage).usagePercent !== undefined
      ) {
        result.weeklyUsage = {
          status: (parsed as OpenCodeWeeklyUsage).status,
          resetInSec: parseInt(String((parsed as OpenCodeWeeklyUsage).resetInSec)),
          usagePercent: parseInt(String((parsed as OpenCodeWeeklyUsage).usagePercent)),
        };
      }
    }
  }

  return result;
};

// Strategy 5: Look for standalone usage objects by property name context
const strategyStandaloneUsage: ParsingStrategy = (html) => {
  const result: StrategyResult = {};
  const allUsageMatches = html.matchAll(
    /(rollingUsage|weeklyUsage):\$R\[\d+\]=(\{status:"[^"]+",resetInSec:\d+,usagePercent:\d+\})/g,
  );

  for (const match of allUsageMatches) {
    const type = match[1] as "rollingUsage" | "weeklyUsage";
    const dataStr = match[2];
    const parsed = parseDirectObject(dataStr);

    if (
      parsed &&
      (parsed as OpenCodeRollingUsage).status &&
      (parsed as OpenCodeRollingUsage).usagePercent !== undefined
    ) {
      const usageData = {
        status: (parsed as OpenCodeRollingUsage).status,
        resetInSec: parseInt(String((parsed as OpenCodeRollingUsage).resetInSec)),
        usagePercent: parseInt(String((parsed as OpenCodeRollingUsage).usagePercent)),
      };

      if (type === "rollingUsage" && !result.rollingUsage) {
        result.rollingUsage = usageData;
      } else if (type === "weeklyUsage" && !result.weeklyUsage) {
        result.weeklyUsage = usageData;
      }
    }
  }

  return result;
};

// All strategies in order of priority
const PARSING_STRATEGIES: ParsingStrategy[] = [
  strategySolidJsHydration,
  strategyBillingPattern,
  strategySubscriptionPattern,
  strategyUsageFromSubscription,
  strategyStandaloneUsage,
];

// Merge strategy results into accumulated result
function mergeResults(accumulated: ParsedHydrationData, strategyResult: StrategyResult): void {
  if (strategyResult.billing && !accumulated.billing) {
    accumulated.billing = strategyResult.billing;
  }
  if (strategyResult.subscription && !accumulated.subscription) {
    accumulated.subscription = strategyResult.subscription;
  }
  if (strategyResult.rollingUsage && !accumulated.rollingUsage) {
    accumulated.rollingUsage = strategyResult.rollingUsage;
  }
  if (strategyResult.weeklyUsage && !accumulated.weeklyUsage) {
    accumulated.weeklyUsage = strategyResult.weeklyUsage;
  }
}

// Main parsing function that orchestrates all strategies
export function parseHydrationData(html: string): ParsedHydrationData {
  const result: ParsedHydrationData = {};

  try {
    for (const strategy of PARSING_STRATEGIES) {
      const strategyResult = strategy(html);
      mergeResults(result, strategyResult);
    }
  } catch (error) {
    logger.error({ err: error }, "Error parsing hydration data");
  }

  return result;
}
