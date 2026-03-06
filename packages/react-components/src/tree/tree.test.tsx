import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { Tree } from "./tree.js";
import type { TreeNode, TreeRowColumn } from "./types.js";

const simpleTree: TreeNode = {
  id: "$",
  name: "root",
  children: [
    {
      id: "$.child1",
      name: "Child 1",
      children: [
        {
          id: "$.child1.1",
          name: "Sub child 1.1",
        },
        {
          id: "$.child1.2",
          name: "Sub child 1.2",
        },
        {
          id: "$.child1.3",
          name: "Sub child 1.3",
        },
      ],
    },
    {
      id: "$.child2",
      name: "Child 2",
      children: [
        {
          id: "$.child2.1",
          name: "Sub child 2.1",
        },
      ],
    },
  ],
};

it("tree is collapsed by default", async () => {
  render(<Tree tree={simpleTree} />);
  const nodes = await screen.findAllByRole("treeitem");
  expect(nodes).toHaveLength(2);
  expect(nodes[0]).toHaveTextContent("Child 1");
  expect(nodes[0]).toHaveAttribute("aria-expanded", "false");
  expect(nodes[1]).toHaveTextContent("Child 2");
  expect(nodes[1]).toHaveAttribute("aria-expanded", "false");
});

it("expand nodes by clicking on it", async () => {
  render(<Tree tree={simpleTree} />);
  const child1 = await screen.findByText("Child 1");
  fireEvent.click(child1);
  const nodes = await screen.findAllByRole("treeitem");
  expect(nodes).toHaveLength(5);
  expect(nodes[0]).toHaveTextContent("Child 1");
  expect(nodes[0]).toHaveAttribute("aria-expanded", "true");

  expect(nodes[1]).toHaveTextContent("Sub child 1.1");
  expect(nodes[2]).toHaveTextContent("Sub child 1.2");
  expect(nodes[3]).toHaveTextContent("Sub child 1.3");

  expect(nodes[4]).toHaveTextContent("Child 2");
  expect(nodes[4]).toHaveAttribute("aria-expanded", "false");
});

it("expand nodes by pressing enter on it", async () => {
  render(<Tree tree={simpleTree} />);
  const treeNode = await screen.findByRole("tree");
  fireEvent.focus(treeNode);
  fireEvent.keyDown(treeNode, { key: "Enter", code: "Enter" });
  expect(await screen.findAllByRole("treeitem")).toHaveLength(5);
});

it("expand nodes by pressing space on it", async () => {
  render(<Tree tree={simpleTree} />);
  const treeNode = await screen.findByRole("tree");
  fireEvent.focus(treeNode);
  fireEvent.keyDown(treeNode, { key: "Space", code: "Space" });
  expect(await screen.findAllByRole("treeitem")).toHaveLength(5);
});

it("use left right arrow to expand and collapse", async () => {
  render(<Tree tree={simpleTree} />);
  const treeNode = await screen.findByRole("tree");
  fireEvent.focus(treeNode);
  fireEvent.keyDown(treeNode, { key: "ArrowRight", code: "ArrowRight" });
  expect(await screen.findAllByRole("treeitem")).toHaveLength(5);
  fireEvent.keyDown(treeNode, { key: "ArrowLeft", code: "ArrowLeft" });
  expect(await screen.findAllByRole("treeitem")).toHaveLength(2);
});

it("use up down arrow to navigate", async () => {
  render(<Tree tree={simpleTree} />);
  const treeNode = await screen.findByRole("tree");
  fireEvent.focus(treeNode);
  let nodes = await screen.findAllByRole("treeitem");

  expect(treeNode).toHaveAttribute("aria-activedescendant", nodes[0].id);
  fireEvent.keyDown(treeNode, { key: "ArrowDown", code: "ArrowDown" });
  expect(treeNode).toHaveAttribute("aria-activedescendant", nodes[1].id);
  fireEvent.keyDown(treeNode, { key: "Space", code: "Space" });
  nodes = await screen.findAllByRole("treeitem");
  fireEvent.keyDown(treeNode, { key: "ArrowDown", code: "ArrowDown" });
  expect(treeNode).toHaveAttribute("aria-activedescendant", nodes[2].id);
  fireEvent.keyDown(treeNode, { key: "ArrowUp", code: "ArrowUp" });
  expect(treeNode).toHaveAttribute("aria-activedescendant", nodes[1].id);
  fireEvent.keyDown(treeNode, { key: "ArrowDown", code: "ArrowDown" });
  fireEvent.keyDown(treeNode, { key: "ArrowDown", code: "ArrowDown" });
  expect(treeNode).toHaveAttribute("aria-activedescendant", nodes[0].id);
});

it("renders columns alongside tree rows", async () => {
  const columns: TreeRowColumn<TreeNode>[] = [
    { render: (row) => <span data-testid={`col-${row.id}`}>Status: {row.id}</span> },
  ];
  render(<Tree tree={simpleTree} columns={columns} />);
  const nodes = await screen.findAllByRole("treeitem");
  expect(nodes).toHaveLength(2);
  // Column cells should render for each visible row
  expect(screen.getByTestId("col-$.child1")).toHaveTextContent("Status: $.child1");
  expect(screen.getByTestId("col-$.child2")).toHaveTextContent("Status: $.child2");
});

it("columns update when nodes expand", async () => {
  const columns: TreeRowColumn<TreeNode>[] = [
    { render: (row) => <span data-testid={`col-${row.id}`}>{row.id}</span> },
  ];
  render(<Tree tree={simpleTree} columns={columns} />);
  fireEvent.click(await screen.findByText("Child 1"));
  const nodes = await screen.findAllByRole("treeitem");
  expect(nodes).toHaveLength(5);
  // All expanded rows should have column cells
  expect(screen.getByTestId("col-$.child1.1")).toBeInTheDocument();
  expect(screen.getByTestId("col-$.child1.2")).toBeInTheDocument();
  expect(screen.getByTestId("col-$.child1.3")).toBeInTheDocument();
});

it("renders header when provided", async () => {
  render(<Tree tree={simpleTree} header={<div data-testid="tree-header">Header Content</div>} />);
  expect(screen.getByTestId("tree-header")).toHaveTextContent("Header Content");
});

it("applies className to the tree container", async () => {
  render(<Tree tree={simpleTree} className="custom-class" />);
  const tree = await screen.findByRole("tree");
  expect(tree.className).toContain("custom-class");
});
