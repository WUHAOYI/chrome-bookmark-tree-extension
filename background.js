chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "open-bookmark-picker") return

  try {
    await chrome.action.openPopup()
  } catch {
    await chrome.action.openPopup({})
  }
})
