import {
  Button,
  Input,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
} from "@fluentui/react-components";
import {
  AddRegular,
  ChevronLeftRegular,
  DeleteRegular,
  MoreHorizontalRegular,
  RenameRegular,
} from "@fluentui/react-icons";
import { useCallback, useState, type FunctionComponent, type KeyboardEvent } from "react";
import { FileTreeExplorer } from "../file-tree/index.js";
import style from "../file-tree/file-tree.module.css";

export interface InputFileTreeProps {
  readonly files: string[];
  readonly activeFile: string;
  readonly onFileSelect: (file: string) => void;
  readonly onFileAdd: (path: string, content?: string) => void;
  readonly onFileRemove: (path: string) => void;
  readonly onFileRename: (oldPath: string, newPath: string) => void;
  readonly onCollapse?: () => void;
}

export const InputFileTree: FunctionComponent<InputFileTreeProps> = ({
  files,
  activeFile,
  onFileSelect,
  onFileAdd,
  onFileRemove,
  onFileRename,
  onCollapse,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [renamingFile, setRenamingFile] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const handleSelect = useCallback(
    (id: string) => {
      if (files.includes(id)) {
        onFileSelect(id);
      }
    },
    [files, onFileSelect],
  );

  const handleCreateStart = useCallback(() => {
    setIsCreating(true);
    setNewFileName("");
  }, []);

  const handleCreateConfirm = useCallback(() => {
    const name = newFileName.trim();
    if (name && !files.includes(name)) {
      const finalName = name.endsWith(".tsp") ? name : `${name}.tsp`;
      onFileAdd(finalName);
    }
    setIsCreating(false);
    setNewFileName("");
  }, [newFileName, files, onFileAdd]);

  const handleCreateKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        handleCreateConfirm();
      } else if (e.key === "Escape") {
        setIsCreating(false);
        setNewFileName("");
      }
    },
    [handleCreateConfirm],
  );

  const handleRenameStart = useCallback((filePath: string) => {
    setRenamingFile(filePath);
    setRenameValue(filePath);
  }, []);

  const handleRenameConfirm = useCallback(() => {
    if (renamingFile && renameValue.trim() && renameValue.trim() !== renamingFile) {
      const finalName = renameValue.trim().endsWith(".tsp")
        ? renameValue.trim()
        : `${renameValue.trim()}.tsp`;
      onFileRename(renamingFile, finalName);
    }
    setRenamingFile(null);
    setRenameValue("");
  }, [renamingFile, renameValue, onFileRename]);

  const handleRenameKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        handleRenameConfirm();
      } else if (e.key === "Escape") {
        setRenamingFile(null);
        setRenameValue("");
      }
    },
    [handleRenameConfirm],
  );

  const handleDelete = useCallback(
    (filePath: string) => {
      if (filePath !== "main.tsp" && filePath !== "tspconfig.yaml") {
        onFileRemove(filePath);
      }
    },
    [onFileRemove],
  );

  return (
    <div className={style["file-tree-with-actions"]}>
      <div className={style["toolbar"]}>
        {onCollapse && (
          <Button
            appearance="subtle"
            size="small"
            icon={<ChevronLeftRegular />}
            onClick={onCollapse}
            title="Collapse file tree"
          />
        )}
        <span className={style["title"]}>Files</span>
        <div className={style["toolbar-actions"]}>
          <Button
            appearance="subtle"
            size="small"
            icon={<AddRegular />}
            onClick={handleCreateStart}
            title="New file"
          />
        </div>
      </div>
      <div className={style["tree-container"]}>
        <FileTreeExplorer files={files} selected={activeFile} onSelect={handleSelect} />
      </div>
      {isCreating && (
        <div className={style["inline-input"]}>
          <Input
            size="small"
            value={newFileName}
            onChange={(_, data) => setNewFileName(data.value)}
            onKeyDown={handleCreateKeyDown}
            onBlur={handleCreateConfirm}
            placeholder="filename.tsp"
            autoFocus
          />
        </div>
      )}
      {renamingFile && (
        <div className={style["inline-input"]}>
          <Input
            size="small"
            value={renameValue}
            onChange={(_, data) => setRenameValue(data.value)}
            onKeyDown={handleRenameKeyDown}
            onBlur={handleRenameConfirm}
            autoFocus
          />
        </div>
      )}
      <div className={style["file-actions"]}>
        {activeFile && activeFile !== "main.tsp" && activeFile !== "tspconfig.yaml" && (
          <Menu>
            <MenuTrigger>
              <Button
                appearance="subtle"
                size="small"
                icon={<MoreHorizontalRegular />}
                title="File actions"
              />
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                <MenuItem icon={<RenameRegular />} onClick={() => handleRenameStart(activeFile)}>
                  Rename
                </MenuItem>
                <MenuItem icon={<DeleteRegular />} onClick={() => handleDelete(activeFile)}>
                  Delete
                </MenuItem>
              </MenuList>
            </MenuPopover>
          </Menu>
        )}
      </div>
    </div>
  );
};
