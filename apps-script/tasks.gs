var JotBotTasks = (function () {
  function createTask(draft, config) {
    var taskListId = config.defaultTaskListId || "@default";
    var resource = {
      title: draft.title || "Untitled Task",
      notes: draft.description || ""
    };

    if (draft.due_datetime_iso) {
      resource.due = new Date(draft.due_datetime_iso).toISOString();
    }

    var created = Tasks.Tasks.insert(resource, taskListId);

    return {
      taskId: created.id,
      taskListId: taskListId,
      title: created.title
    };
  }

  function deleteTask(taskId, taskListId) {
    try {
      Tasks.Tasks.remove(taskListId || "@default", taskId);
      return true;
    } catch (err) {
      console.error("JotBotTasks.deleteTask failed:", err);
      return false;
    }
  }

  return {
    createTask: createTask,
    deleteTask: deleteTask
  };
})();
