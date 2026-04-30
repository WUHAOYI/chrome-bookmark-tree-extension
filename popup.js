const bookmarkTitleEl = document.getElementById("bookmarkTitle")
const pageUrlEl = document.getElementById("pageUrl")
const treeEl = document.getElementById("tree")
const searchEl = document.getElementById("search")
const clearSearchEl = document.getElementById("clearSearch")
const newFolderEl = document.getElementById("newFolder")
const deleteFolderEl = document.getElementById("deleteFolder")
const saveEl = document.getElementById("save")
const statusEl = document.getElementById("status")

const state = {
  tab: null,
  tree: null,
  selectedFolderId: null,
  folderElById: new Map(),
  parentById: new Map(),
  nameById: new Map(),
  expandedIds: new Set(),
  protectedIds: new Set()
}

function setStatus(text, type) {
  statusEl.textContent = text || ""
  statusEl.classList.toggle("error", type === "error")
}

function canDeleteFolder(folderId) {
  if (!folderId) return false
  if (state.protectedIds.has(folderId)) return false
  return true
}

function setSelected(folderId) {
  state.selectedFolderId = folderId
  for (const [id, el] of state.folderElById.entries()) {
    const nodeEl = el.querySelector(":scope > .node")
    if (!nodeEl) continue
    nodeEl.classList.toggle("selected", id === folderId)
  }
  saveEl.disabled = !state.selectedFolderId || !state.tab?.url
  newFolderEl.disabled = !state.selectedFolderId
  deleteFolderEl.disabled = !canDeleteFolder(state.selectedFolderId)
  if (state.selectedFolderId) {
    setStatus(`已选择：${state.nameById.get(state.selectedFolderId) || ""}`)
  }
}

function updateExpandedClass(folderId) {
  const el = state.folderElById.get(folderId)
  if (!el) return
  el.classList.toggle("expanded", state.expandedIds.has(folderId))
}

function expandPath(folderId) {
  let cur = folderId
  while (cur) {
    state.expandedIds.add(cur)
    cur = state.parentById.get(cur) || null
  }
  for (const id of state.expandedIds) updateExpandedClass(id)
}

function toggleExpanded(folderId) {
  if (state.expandedIds.has(folderId)) state.expandedIds.delete(folderId)
  else state.expandedIds.add(folderId)
  updateExpandedClass(folderId)
}

function createFolderElement(folderNode, parentId) {
  const wrapper = document.createElement("div")
  wrapper.className = "folder"
  wrapper.dataset.id = folderNode.id

  const nodeEl = document.createElement("div")
  nodeEl.className = "node"
  nodeEl.setAttribute("role", "treeitem")

  const caret = document.createElement("div")
  caret.className = "caret"
  caret.setAttribute("aria-hidden", "true")

  const caretIcon = document.createElement("div")
  caretIcon.className = "caretIcon"
  caret.appendChild(caretIcon)

  const nameEl = document.createElement("div")
  nameEl.className = "folderName"
  nameEl.textContent = folderNode.title || "（未命名）"

  nodeEl.appendChild(caret)
  nodeEl.appendChild(nameEl)

  const childrenEl = document.createElement("div")
  childrenEl.className = "children"
  childrenEl.setAttribute("role", "group")

  wrapper.appendChild(nodeEl)
  wrapper.appendChild(childrenEl)

  const folderChildren = (folderNode.children || []).filter((c) => Array.isArray(c.children))
  caret.style.visibility = folderChildren.length ? "visible" : "hidden"

  caret.addEventListener("click", (e) => {
    e.stopPropagation()
    if (!folderChildren.length) return
    toggleExpanded(folderNode.id)
  })

  nodeEl.addEventListener("click", () => {
    setSelected(folderNode.id)
    expandPath(folderNode.id)
  })

  state.folderElById.set(folderNode.id, wrapper)
  state.nameById.set(folderNode.id, folderNode.title || "（未命名）")
  if (parentId) state.parentById.set(folderNode.id, parentId)

  for (const child of folderChildren) {
    const childEl = createFolderElement(child, folderNode.id)
    childrenEl.appendChild(childEl)
  }

  return wrapper
}

function renderTree(tree) {
  treeEl.innerHTML = ""
  state.folderElById.clear()
  state.parentById.clear()
  state.nameById.clear()
  state.protectedIds.clear()

  const root = Array.isArray(tree) ? tree[0] : null
  const rootFolders = (root?.children || []).filter((c) => Array.isArray(c.children))
  for (const folder of rootFolders) state.protectedIds.add(folder.id)

  const frag = document.createDocumentFragment()
  for (const folder of rootFolders) {
    const el = createFolderElement(folder, null)
    frag.appendChild(el)
    state.expandedIds.add(folder.id)
  }

  treeEl.appendChild(frag)

  for (const id of state.expandedIds) updateExpandedClass(id)
}

function applySearch(query) {
  const q = (query || "").trim().toLowerCase()
  if (!q) {
    for (const el of state.folderElById.values()) el.style.display = ""
    for (const id of state.folderElById.keys()) updateExpandedClass(id)
    if (state.selectedFolderId) expandPath(state.selectedFolderId)
    return
  }

  const visible = new Set()

  for (const [id, name] of state.nameById.entries()) {
    if (!name.toLowerCase().includes(q)) continue
    let cur = id
    while (cur) {
      visible.add(cur)
      cur = state.parentById.get(cur) || null
    }
  }

  for (const [id, el] of state.folderElById.entries()) {
    el.style.display = visible.has(id) ? "" : "none"
  }

  for (const id of visible) {
    state.expandedIds.add(id)
    updateExpandedClass(id)
  }
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  return tabs[0] || null
}

async function loadLastFolderId() {
  const data = await chrome.storage.local.get(["lastFolderId"])
  return data.lastFolderId || null
}

async function reloadTree(preferSelectId) {
  const prevExpanded = new Set(state.expandedIds)
  const prevSelected = state.selectedFolderId
  const prevSearch = searchEl.value

  state.tree = await chrome.bookmarks.getTree()
  state.expandedIds = prevExpanded
  renderTree(state.tree)

  for (const id of [...state.expandedIds]) {
    if (!state.folderElById.has(id)) state.expandedIds.delete(id)
  }

  applySearch(prevSearch)

  const nextSelected =
    (preferSelectId && state.folderElById.has(preferSelectId) && preferSelectId) ||
    (prevSelected && state.folderElById.has(prevSelected) && prevSelected) ||
    state.folderElById.keys().next().value ||
    null

  if (nextSelected) {
    setSelected(nextSelected)
    expandPath(nextSelected)
  } else {
    setSelected(null)
  }
}

async function saveBookmark() {
  if (!state.tab?.url) {
    setStatus("无法获取当前页面", "error")
    return
  }

  const parentId = state.selectedFolderId || "1"
  const customTitle = bookmarkTitleEl.value.trim()
  const title = customTitle || state.tab.title || state.tab.url
  const url = state.tab.url

  saveEl.disabled = true
  setStatus("正在保存…")

  try {
    await chrome.bookmarks.create({ parentId, title, url })
    await chrome.storage.local.set({ lastFolderId: parentId })
    setStatus("已保存")
    window.close()
  } catch (e) {
    setStatus(e?.message || "保存失败", "error")
    saveEl.disabled = false
  }
}

async function createFolder() {
  if (!state.selectedFolderId) return
  const name = window.prompt("新建文件夹名称")
  if (name == null) return
  const title = name.trim()
  if (!title) {
    setStatus("文件夹名称不能为空", "error")
    return
  }

  const parentId = state.selectedFolderId
  newFolderEl.disabled = true
  deleteFolderEl.disabled = true
  saveEl.disabled = true
  setStatus("正在创建…")

  try {
    const folder = await chrome.bookmarks.create({ parentId, title })
    await chrome.storage.local.set({ lastFolderId: folder.id })
    await reloadTree(folder.id)
    setStatus("已创建")
  } catch (e) {
    setStatus(e?.message || "创建失败", "error")
  } finally {
    newFolderEl.disabled = !state.selectedFolderId
    deleteFolderEl.disabled = !canDeleteFolder(state.selectedFolderId)
    saveEl.disabled = !state.selectedFolderId || !state.tab?.url
  }
}

async function deleteFolder() {
  const folderId = state.selectedFolderId
  if (!folderId) return
  if (!canDeleteFolder(folderId)) {
    setStatus("该文件夹不可删除", "error")
    return
  }

  const name = state.nameById.get(folderId) || ""
  const ok = window.confirm(`确定删除文件夹“${name}”及其所有子项吗？`)
  if (!ok) return

  const parentId = state.parentById.get(folderId) || null
  newFolderEl.disabled = true
  deleteFolderEl.disabled = true
  saveEl.disabled = true
  setStatus("正在删除…")

  try {
    await chrome.bookmarks.removeTree(folderId)
    await chrome.storage.local.set({ lastFolderId: parentId || "1" })
    await reloadTree(parentId || "1")
    setStatus("已删除")
  } catch (e) {
    setStatus(e?.message || "删除失败", "error")
  } finally {
    newFolderEl.disabled = !state.selectedFolderId
    deleteFolderEl.disabled = !canDeleteFolder(state.selectedFolderId)
    saveEl.disabled = !state.selectedFolderId || !state.tab?.url
  }
}

async function init() {
  setStatus("加载中…")

  state.tab = await getActiveTab()
  bookmarkTitleEl.value = state.tab?.title || ""
  pageUrlEl.textContent = state.tab?.url || ""

  state.tree = await chrome.bookmarks.getTree()
  renderTree(state.tree)

  const lastFolderId = await loadLastFolderId()
  const defaultId = lastFolderId && state.folderElById.has(lastFolderId) ? lastFolderId : null

  if (defaultId) {
    setSelected(defaultId)
    expandPath(defaultId)
  } else {
    const first = state.folderElById.keys().next().value
    if (first) {
      setSelected(first)
      expandPath(first)
    }
  }

  saveEl.addEventListener("click", saveBookmark)
  newFolderEl.addEventListener("click", createFolder)
  deleteFolderEl.addEventListener("click", deleteFolder)

  searchEl.addEventListener("input", () => applySearch(searchEl.value))
  clearSearchEl.addEventListener("click", () => {
    searchEl.value = ""
    applySearch("")
    searchEl.focus()
  })

  saveEl.disabled = !state.selectedFolderId || !state.tab?.url
  bookmarkTitleEl.focus()
  bookmarkTitleEl.select()
  setStatus(state.selectedFolderId ? `已选择：${state.nameById.get(state.selectedFolderId) || ""}` : "")
}

init().catch((e) => {
  setStatus(e?.message || "初始化失败", "error")
})
