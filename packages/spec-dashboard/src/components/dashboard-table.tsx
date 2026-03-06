import { mergeClasses, Popover, PopoverSurface, PopoverTrigger } from "@fluentui/react-components";
import { CodeBlock16Filled, Print16Filled } from "@fluentui/react-icons";
import { Tree, type TreeNode, type TreeRowColumn } from "@typespec/react-components";
import { ScenarioData, ScenarioManifest } from "@typespec/spec-coverage-sdk";
import { FunctionComponent, useMemo } from "react";
import { CoverageSummary, GeneratorCoverageSuiteReport } from "../apis.js";
import { getCompletedRatio } from "../utils/coverage-utils.js";
import style from "./dashboard-table.module.css";
import { GeneratorInformation } from "./generator-information.js";
import { ScenarioGroupRatioStatusBox } from "./scenario-group-status.js";
import { ScenarioLabel } from "./scenario-label.js";
import { ScenarioStatusBox } from "./scenario-status.js";

export interface DashboardTableProps {
  coverageSummary: CoverageSummary;
  emitterDisplayNames?: Record<string, string>;
}

interface DashboardTreeNode extends TreeNode {
  readonly fullName: string;
  readonly scenario?: ScenarioData;
  readonly children?: DashboardTreeNode[];
}

export const DashboardTable: FunctionComponent<DashboardTableProps> = ({
  coverageSummary,
  emitterDisplayNames,
}) => {
  const languages: string[] = Object.keys(coverageSummary.generatorReports) as any;
  const tree = useMemo(() => createTree(coverageSummary.manifest), [coverageSummary.manifest]);

  const columns: TreeRowColumn<DashboardTreeNode>[] = useMemo(
    () =>
      languages.map((lang) => ({
        render: (row) => {
          const scenarioData = row.item.scenario;
          return (
            <div className={style["scenario-status-cell"]}>
              {scenarioData ? (
                <ScenarioStatusBox
                  status={coverageSummary.generatorReports[lang]?.results[scenarioData.name]}
                />
              ) : (
                <ScenarioGroupStatusCell
                  coverageSummary={coverageSummary}
                  group={row.item.fullName}
                  lang={lang}
                />
              )}
            </div>
          );
        },
      })),
    [languages, coverageSummary],
  );

  const header = useMemo(
    () => (
      <DashboardHeaderRow
        coverageSummary={coverageSummary}
        emitterDisplayNames={emitterDisplayNames}
      />
    ),
    [coverageSummary, emitterDisplayNames],
  );

  return (
    <Tree<DashboardTreeNode>
      tree={tree}
      columns={columns}
      header={header}
      className={style["dashboard-tree"]}
    />
  );
};

interface ScenarioGroupStatusCellProps {
  coverageSummary: CoverageSummary;
  lang: string;
  group: string;
}
const ScenarioGroupStatusCell: FunctionComponent<ScenarioGroupStatusCellProps> = ({
  lang,
  coverageSummary,
  group,
}) => {
  const report = coverageSummary.generatorReports[lang];
  const ratio = report ? getCompletedRatio(coverageSummary.manifest.scenarios, report, group) : 0;
  return <ScenarioGroupRatioStatusBox ratio={ratio} />;
};

interface DashboardHeaderRowProps {
  coverageSummary: CoverageSummary;
  emitterDisplayNames?: Record<string, string>;
}

const DashboardHeaderRow: FunctionComponent<DashboardHeaderRowProps> = ({
  coverageSummary,
  emitterDisplayNames,
}) => {
  const data: [string, number, GeneratorCoverageSuiteReport | undefined][] = Object.entries(
    coverageSummary.generatorReports,
  ).map(([language, report]) => {
    if (report === undefined) {
      return [language, 0, undefined];
    }
    return [language, getCompletedRatio(coverageSummary.manifest.scenarios, report), report];
  });

  return (
    <>
      <div className={style["header-label"]}>
        {coverageSummary.tableName || coverageSummary.manifest.displayName || "Specs"}
      </div>
      {data.map(([lang, status, report]) => (
        <GeneratorHeaderCell
          key={lang}
          status={status}
          report={report}
          language={lang}
          displayName={emitterDisplayNames?.[lang as string]}
        />
      ))}
    </>
  );
};

export interface GeneratorHeaderCellProps {
  status: number;
  report: GeneratorCoverageSuiteReport | undefined;
  language: string;
  displayName?: string;
}

export const GeneratorHeaderCell: FunctionComponent<GeneratorHeaderCellProps> = ({
  status,
  report,
  language,
  displayName,
}) => {
  return (
    <div className={style["header-cell"]}>
      <div className={style["header-grid"]}>
        <div title="Generator name" className={style["header-name"]}>
          <Popover withArrow>
            <PopoverTrigger>
              <div>{displayName ?? report?.generatorMetadata?.name ?? language}</div>
            </PopoverTrigger>
            <PopoverSurface>
              {report && <GeneratorInformation status={status} report={report} />}
            </PopoverSurface>
          </Popover>
        </div>
        <div
          title="Generator version used in this coverage."
          className={mergeClasses(style["version"], style["gen-version"])}
        >
          <Print16Filled className={style["version-icon"]} />
          {report?.generatorMetadata?.version ?? "?"}
        </div>
        <div
          title="Scenario version used in this coverage."
          className={mergeClasses(style["version"], style["spec-version"])}
        >
          <CodeBlock16Filled className={style["version-icon"]} />
          {report?.scenariosMetadata?.version ?? "?"}
        </div>
        <div title="Coverage stats" className={style["header-status"]}>
          <ScenarioGroupRatioStatusBox ratio={status} />
        </div>
      </div>
    </div>
  );
};

function createTree(manifest: ScenarioManifest): DashboardTreeNode {
  interface BuildNode {
    name: string;
    fullName: string;
    scenario?: ScenarioData;
    children: Record<string, BuildNode>;
  }

  const root: BuildNode = { name: "", fullName: "", children: {} };

  const sortedScenarios = [...manifest.scenarios].sort((a, b) => a.name.localeCompare(b.name));
  for (const scenario of sortedScenarios) {
    const segments = scenario.name.split("_");
    let current: BuildNode = root;

    for (const [index, segment] of segments.entries()) {
      if (!(segment in current.children)) {
        current.children[segment] = {
          name: segment,
          fullName: segments.slice(0, index + 1).join("_"),
          children: {},
        };
      }
      current = current.children[segment];
    }

    current.scenario = scenario;
  }

  return convertToTreeNode(root, manifest);
}

function convertToTreeNode(
  node: { name: string; fullName: string; scenario?: ScenarioData; children: Record<string, any> },
  manifest: ScenarioManifest,
): DashboardTreeNode {
  const childEntries = Object.values(node.children);
  const children =
    childEntries.length > 0
      ? childEntries.map((child) => convertToTreeNode(child, manifest))
      : undefined;

  const hasChildren = children && children.length > 0;
  const label = hasChildren ? (
    <ScenarioLabel
      name={node.name}
      manifest={manifest}
      scenario={node.scenario}
      childCount={countLeafChildren(node)}
    />
  ) : (
    <ScenarioLabel name={node.name} manifest={manifest} scenario={node.scenario} />
  );

  return {
    id: node.fullName || "$root",
    name: label,
    fullName: node.fullName,
    scenario: node.scenario,
    children,
  };
}

function countLeafChildren(node: { children: Record<string, any> }): number {
  const entries = Object.values(node.children);
  if (entries.length === 0) {
    return 1;
  }
  return entries.reduce((acc: number, child: any) => acc + countLeafChildren(child), 0);
}
