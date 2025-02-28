<template>
  <button
    class="btn-primary flex flex-row justify-center items-center"
    @click="state.showConfirmModal = true"
  >
    <heroicons-outline:document-download class="w-4 h-auto mr-0.5" />
    {{ $t("common.export") }}
  </button>

  <BBModal
    v-if="state.showConfirmModal"
    :title="$t('common.export')"
    header-class="overflow-hidden"
    @confirm="handleExport"
    @close="state.showConfirmModal = false"
  >
    <div class="w-128 mb-6">
      {{ $t("issue.grant-request.data-export-attention") }}
    </div>
    <div class="w-full flex items-center justify-end mt-2 space-x-3 pr-1 pb-1">
      <button
        type="button"
        class="btn-cancel"
        @click="state.showConfirmModal = false"
      >
        {{ $t("common.cancel") }}
      </button>
      <button
        class="btn-primary"
        :disabled="state.isRequesting"
        @click="handleExport"
      >
        <BBSpin v-if="state.isRequesting" class="mr-2" color="text-white" />
        {{ $t("common.confirm") }}
      </button>
    </div>
  </BBModal>
</template>

<script lang="ts" setup>
import { computed, onMounted, reactive } from "vue";
import { useExtraIssueLogic, useIssueLogic } from "../logic";
import { DatabaseId, GrantRequestPayload, Issue, UNKNOWN_ID } from "@/types";
import { useInstanceV1Store } from "@/store/modules/v1/instance";
import { pushNotification, useDatabaseStore, useSQLStore } from "@/store";
import { instanceNamePrefix } from "@/store/modules/v1/common";
import { head } from "lodash-es";
import { unparse } from "papaparse";
import dayjs from "dayjs";
import { BBSpin } from "@/bbkit";

interface LocalState {
  databaseId: DatabaseId;
  statement: string;
  maxRowCount: number;
  exportFormat: "CSV" | "JSON";
  showConfirmModal: boolean;
  isRequesting: boolean;
}

const { changeIssueStatus } = useExtraIssueLogic();
const { issue } = useIssueLogic();
const databaseStore = useDatabaseStore();
const instanceV1Store = useInstanceV1Store();
const state = reactive<LocalState>({
  databaseId: UNKNOWN_ID,
  statement: "",
  maxRowCount: 1000,
  exportFormat: "CSV",
  showConfirmModal: false,
  isRequesting: false,
});

const exportContext = computed(() => {
  const database = databaseStore.getDatabaseById(state.databaseId);
  if (database.id === UNKNOWN_ID) {
    throw "Database not found";
  }
  return {
    instanceId: database.instanceId,
    databaseName: database.name,
    statement: state.statement,
    limit: state.maxRowCount,
    exportFormat: state.exportFormat,
  };
});

onMounted(async () => {
  const payload = ((issue.value as Issue).payload as any)
    .grantRequest as GrantRequestPayload;
  if (payload.role !== "roles/EXPORTER") {
    throw "Only support EXPORTER role";
  }
  const expressionList = payload.condition.expression.split(" && ");
  for (const expression of expressionList) {
    const fields = expression.split(" ");
    if (fields[0] === "request.statement") {
      state.statement = atob(JSON.parse(fields[2]));
    } else if (fields[0] === "resource.database") {
      const databaseIdList = [];
      for (const url of JSON.parse(fields[2])) {
        const value = url.split("/");
        const instanceName = value[1] || "";
        const databaseName = value[3] || "";
        const instance = await instanceV1Store.getOrFetchInstanceByName(
          instanceNamePrefix + instanceName
        );
        const databaseList =
          await databaseStore.getOrFetchDatabaseListByInstanceId(instance.uid);
        const database = databaseList.find((db) => db.name === databaseName);
        if (database) {
          databaseIdList.push(database.id);
        }
      }
      state.databaseId = head(databaseIdList) || UNKNOWN_ID;
    } else if (fields[0] === "request.row_limit") {
      state.maxRowCount = Number(fields[2]);
    } else if (fields[0] === "request.export_format") {
      state.exportFormat = JSON.parse(fields[2]) as "CSV" | "JSON";
    }
  }
});

const handleExport = async () => {
  if (state.isRequesting) {
    return;
  }

  state.isRequesting = true;
  const queryResult = await useSQLStore().query(exportContext.value);
  if (queryResult.error) {
    pushNotification({
      module: "bytebase",
      style: "CRITICAL",
      title: `Failed to export data`,
      description: queryResult.error,
    });
    return;
  }
  const result = head(queryResult.resultList);
  if (!result || result.error) {
    pushNotification({
      module: "bytebase",
      style: "CRITICAL",
      title: `Failed to export data`,
      description: result?.error || "No result found",
    });
    return;
  }

  const columns = result.data[0];
  const data = result.data[2];
  let rawText = "";

  if (state.exportFormat === "CSV") {
    const csvFields = columns.map((col) => col);
    const csvData = data.map((d) => {
      const temp: any[] = [];
      for (const k in d) {
        temp.push(d[k]);
      }
      return temp;
    });

    rawText = unparse({
      fields: csvFields,
      data: csvData,
    });
  } else {
    const objects = [];
    for (const item of data) {
      const object = {} as any;
      for (let i = 0; i < columns.length; i++) {
        object[columns[i]] = item[i];
      }
      objects.push(object);
    }
    rawText = JSON.stringify(objects);
  }

  const fileFormat = state.exportFormat.toLowerCase();
  const encodedUri = encodeURI(
    `data:text/${fileFormat};charset=utf-8,${rawText}`
  );
  const formattedDateString = dayjs(new Date()).format("YYYY-MM-DDTHH-mm-ss");
  const filename = `export-data-${formattedDateString}`;
  const link = document.createElement("a");
  link.download = `${filename}.${fileFormat}`;
  link.href = encodedUri;
  link.click();
  state.isRequesting = false;
  state.showConfirmModal = false;

  // After data exported successfully, we change the issue status to DONE automatically.
  changeIssueStatus("DONE", "");
};
</script>
