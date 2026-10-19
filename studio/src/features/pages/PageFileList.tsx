import { useMemo, useState } from 'react';
import {
  buildPageTree,
  stripPageExtension,
  type PageTreeNode,
} from '../../../vendor/stacki/src/features/pages/pageTree';
import {
  comparePageNames,
  isCollectionRoute,
  leadsFolders,
} from '../../../vendor/stacki/src/features/pages/pageOrder';
import {
  FileIcon,
  CollectionIcon,
  FolderIcon,
  FolderOpenIcon,
} from '../../../vendor/stacki/src/ui/Icons';
import type { Peer } from '../collaboration/presence';
import { routeFor } from '../project/projectClient';
import { PagePresence } from './PagePresence';

interface Props {
  readonly items: readonly string[];
  readonly query: string;
  readonly file: string;
  readonly peers: readonly Peer[];
  readonly open: (file: string) => void;
  readonly collection: boolean;
}
export function PageFileList(props: Props) {
  const pages = useMemo(
    () =>
      props.items.map((path) => ({
        path,
        name: path.replace(/^src\/(pages|content|data)\//, ''),
        route: routeFor(path),
      })),
    [props.items],
  );
  const tree = useMemo(() => buildPageTree(pages, []), [pages]);
  const query = props.query.trim().toLowerCase();
  const results = pages
    .filter((page) => page.name.toLowerCase().includes(query))
    .sort((a, b) => comparePageNames(a.name, b.name));
  return (
    <div className="panel-body studio-page-list">
      {query ? (
        results.map((page) => <FileRow key={page.path} {...page} depth={0} props={props} />)
      ) : (
        <PageBranch tree={tree} depth={0} props={props} />
      )}
      {query && !results.length && (
        <div className="props-empty">No matching {props.collection ? 'items' : 'pages'}</div>
      )}
    </div>
  );
}

function PageBranch({
  tree,
  depth,
  props,
}: {
  readonly tree: PageTreeNode;
  readonly depth: number;
  readonly props: Props;
}) {
  const pages = [...tree.pages].sort((a, b) => comparePageNames(a.base, b.base));
  const render = (page: (typeof pages)[number]) => (
    <FileRow
      key={page.path}
      path={page.path}
      name={page.base}
      route={page.route}
      depth={depth}
      props={props}
    />
  );
  return (
    <>
      {pages.filter((page) => leadsFolders(page.base)).map(render)}
      {[...tree.directories]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, child]) => (
          <FolderBranch key={name} name={name} tree={child} depth={depth} props={props} />
        ))}
      {pages.filter((page) => !leadsFolders(page.base)).map(render)}
    </>
  );
}
function FolderBranch({
  name,
  tree,
  depth,
  props,
}: {
  readonly name: string;
  readonly tree: PageTreeNode;
  readonly depth: number;
  readonly props: Props;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <>
      <button
        className="list-item folder"
        aria-expanded={!collapsed}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => setCollapsed(!collapsed)}
      >
        <span className="icon">
          {collapsed ? <FolderIcon size={13} /> : <FolderOpenIcon size={13} />}
        </span>
        <span className="label">{name}</span>
      </button>
      {!collapsed && <PageBranch tree={tree} depth={depth + 1} props={props} />}
    </>
  );
}
function FileRow({
  path,
  name,
  route,
  depth,
  props,
}: {
  readonly path: string;
  readonly name: string;
  readonly route: string;
  readonly depth: number;
  readonly props: Props;
}) {
  const collection = props.collection || isCollectionRoute(path);
  return (
    <button
      data-file={path}
      aria-label={name}
      aria-current={props.file === path ? 'page' : undefined}
      className={`list-item file-row ${collection ? 'collection' : ''} ${props.file === path ? 'active' : ''}`}
      style={{ paddingLeft: 8 + depth * 14 }}
      title={props.collection ? path : route}
      onClick={() => props.open(path)}
    >
      <span className="icon">
        {collection ? <CollectionIcon size={13} /> : <FileIcon size={13} />}
      </span>
      <span className="label file-row-name">{stripPageExtension(name)}</span>
      {!props.collection && <PagePresence peers={props.peers} page={path} />}
    </button>
  );
}
