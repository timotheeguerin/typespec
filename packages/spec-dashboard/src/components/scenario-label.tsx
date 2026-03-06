import {
  Button,
  Popover,
  PopoverSurface,
  PopoverTrigger,
  Title3,
  Tooltip,
} from "@fluentui/react-components";
import { BookInformation20Regular, Braces20Filled } from "@fluentui/react-icons";
import { ScenarioData, ScenarioManifest } from "@typespec/spec-coverage-sdk";
import { FunctionComponent } from "react";
import ReactMarkdown from "react-markdown";
import style from "./scenario-label.module.css";

export interface ScenarioLabelProps {
  name: string;
  manifest: ScenarioManifest;
  scenario?: ScenarioData;
  childCount?: number;
}

export const ScenarioLabel: FunctionComponent<ScenarioLabelProps> = ({
  name,
  manifest,
  scenario,
  childCount,
}) => {
  const label = childCount !== undefined ? `${name} (${childCount} scenarios)` : name;
  return (
    <span className={style["label"]}>
      <span className={style["label-text"]}>{label}</span>
      {scenario && <ScenarioInfoButton scenario={scenario} />}
      {scenario && manifest.sourceUrl && (
        <GotoSourceButton sourceUrl={manifest.sourceUrl} scenario={scenario} />
      )}
    </span>
  );
};

type ScenarioInfoButtonProps = {
  scenario: ScenarioData;
};

const ScenarioInfoButton: FunctionComponent<ScenarioInfoButtonProps> = ({ scenario }) => {
  return (
    <Popover withArrow>
      <PopoverTrigger disableButtonEnhancement>
        <Tooltip content="Show scenario documentation" relationship="label">
          <Button
            icon={<BookInformation20Regular />}
            aria-label="Show information"
            appearance="transparent"
            size="small"
          />
        </Tooltip>
      </PopoverTrigger>
      <PopoverSurface>
        <Title3>Scenario documentation</Title3>
        <ReactMarkdown children={scenario.scenarioDoc} remarkPlugins={[]} />
      </PopoverSurface>
    </Popover>
  );
};

type ShowSourceButtonProps = {
  sourceUrl: string;
  scenario: ScenarioData;
};
const GotoSourceButton: FunctionComponent<ShowSourceButtonProps> = ({ sourceUrl, scenario }) => {
  const start = getGithubLineNumber(scenario.location.start.line);
  const end = getGithubLineNumber(scenario.location.end.line);
  const url = `${sourceUrl.replaceAll("{scenarioPath}", scenario.location.path)}#${start}-${end}`;
  return (
    <Tooltip content="Go to source" relationship="label">
      <Button
        icon={<Braces20Filled />}
        as="a"
        appearance="transparent"
        size="small"
        aria-label="Go to source"
        href={url}
        target="_blank"
      />
    </Tooltip>
  );
};

function getGithubLineNumber(value: number): `L${number}` {
  return `L${value + 1}`;
}
