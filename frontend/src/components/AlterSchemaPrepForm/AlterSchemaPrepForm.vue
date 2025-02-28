<template>
  <div class="space-y-4 max-w-min overflow-x-hidden">
    <div class="overflow-x-auto">
      <div class="w-[calc(100vw-8rem)] lg:w-[56rem]">
        <template v-if="projectId">
          <template v-if="isTenantProject">
            <!-- tenant mode project -->
            <NTabs v-model:value="state.alterType">
              <NTabPane :tab="$t('alter-schema.alter-db-group')" name="TENANT">
                <div
                  class="overflow-y-auto"
                  style="max-height: calc(100vh - 360px)"
                >
                  <ProjectTenantView
                    :state="state"
                    :database-list="schemaDatabaseList"
                    :environment-list="environmentList"
                    :project="state.project"
                    @dismiss="cancel"
                  />
                  <SchemalessDatabaseTable
                    v-if="isAlterSchema"
                    mode="PROJECT"
                    :database-list="schemalessDatabaseList"
                  />
                </div>
              </NTabPane>
              <NTabPane
                :tab="$t('alter-schema.alter-multiple-db')"
                name="MULTI_DB"
              >
                <div
                  class="overflow-y-auto"
                  style="max-height: calc(100vh - 400px)"
                >
                  <DatabaseTable
                    mode="PROJECT_SHORT"
                    table-class="border"
                    :custom-click="true"
                    :database-list="schemaDatabaseList"
                    :show-selection-column="true"
                    @select-database="
                    (db: Database) => toggleDatabaseSelection(db, !isDatabaseSelected(db))
                  "
                  >
                    <template
                      #selection-all="{ databaseList: renderedDatabaseList }"
                    >
                      <input
                        v-if="renderedDatabaseList.length > 0"
                        type="checkbox"
                        class="h-4 w-4 text-accent rounded disabled:cursor-not-allowed border-control-border focus:ring-accent"
                        v-bind="getAllSelectionState(renderedDatabaseList)"
                        @input="
                          toggleAllDatabasesSelection(
                            renderedDatabaseList,
                            ($event.target as HTMLInputElement).checked
                          )
                        "
                      />
                    </template>
                    <template #selection="{ database }">
                      <input
                        type="checkbox"
                        class="h-4 w-4 text-accent rounded disabled:cursor-not-allowed border-control-border focus:ring-accent"
                        :checked="isDatabaseSelected(database)"
                        @input="(e: any) => toggleDatabaseSelection(database, e.target.checked)"
                      />
                    </template>
                  </DatabaseTable>
                  <SchemalessDatabaseTable
                    v-if="isAlterSchema"
                    mode="PROJECT"
                    :database-list="schemalessDatabaseList"
                  />
                </div>
              </NTabPane>
              <template #suffix>
                <BBTableSearch
                  v-if="state.alterType === 'MULTI_DB'"
                  class="m-px"
                  :placeholder="$t('database.search-database')"
                  @change-text="(text: string) => (state.searchText = text)"
                />
                <YAxisRadioGroup
                  v-else
                  v-model:label="state.label"
                  class="text-sm m-px"
                />
              </template>
            </NTabs>
          </template>
          <template v-else>
            <!-- standard mode project, single/multiple databases ui -->
            <div
              class="overflow-y-auto"
              style="max-height: calc(100vh - 380px)"
            >
              <ProjectStandardView
                :state="state"
                :project="state.project"
                :database-list="schemaDatabaseList"
                :environment-list="environmentList"
                @select-database="selectDatabase"
              >
                <template #header>
                  <div class="flex items-center justify-end mx-2 mb-2">
                    <BBTableSearch
                      class="m-px"
                      :placeholder="$t('database.search-database')"
                      @change-text="(text: string) => (state.searchText = text)"
                    />
                  </div>
                </template>
              </ProjectStandardView>
              <SchemalessDatabaseTable
                v-if="isAlterSchema"
                mode="PROJECT"
                class="px-2"
                :database-list="schemalessDatabaseList"
              />
            </div>
          </template>
        </template>
        <template v-else>
          <aside class="flex justify-end mb-4">
            <BBTableSearch
              class="m-px"
              :placeholder="$t('database.search-database')"
              @change-text="(text: string) => (state.searchText = text)"
            />
          </aside>
          <!-- a simple table -->
          <div class="overflow-y-auto" style="max-height: calc(100vh - 340px)">
            <DatabaseTable
              mode="ALL_SHORT"
              table-class="border"
              :custom-click="true"
              :database-list="schemaDatabaseList"
              @select-database="selectDatabase"
            />

            <SchemalessDatabaseTable
              v-if="isAlterSchema"
              mode="ALL"
              :database-list="schemalessDatabaseList"
            />
          </div>
        </template>
      </div>
    </div>

    <!-- Create button group -->
    <div
      class="pt-4 border-t border-block-border flex items-center justify-between"
    >
      <div>
        <div
          v-if="flattenSelectedDatabaseIdList.length > 0"
          class="textinfolabel"
        >
          {{
            $t("database.selected-n-databases", {
              n: flattenSelectedDatabaseIdList.length,
            })
          }}
        </div>
      </div>

      <div class="flex items-center justify-end">
        <button
          type="button"
          class="btn-normal py-2 px-4"
          @click.prevent="cancel"
        >
          {{ $t("common.cancel") }}
        </button>
        <button
          v-if="showGenerateMultiDb"
          class="btn-primary ml-3 inline-flex justify-center py-2 px-4"
          :disabled="!allowGenerateMultiDb"
          @click.prevent="generateMultiDb"
        >
          {{ $t("common.next") }}
        </button>

        <button
          v-if="showGenerateTenant"
          class="btn-primary ml-3 inline-flex justify-center py-2 px-4"
          :disabled="!allowGenerateTenant"
          @click.prevent="generateTenant"
        >
          {{ $t("common.next") }}
        </button>
      </div>
    </div>
  </div>

  <FeatureModal
    v-if="state.showFeatureModal"
    feature="bb.feature.multi-tenancy"
    @cancel="state.showFeatureModal = false"
  />

  <GhostDialog ref="ghostDialog" />

  <SchemaEditorModal
    v-if="state.showSchemaEditorModal"
    :database-id-list="schemaEditorContext.databaseIdList"
    :alter-type="state.alterType"
    @close="state.showSchemaEditorModal = false"
  />
</template>

<script lang="ts" setup>
import dayjs from "dayjs";
import { computed, reactive, PropType, ref } from "vue";
import { useRouter } from "vue-router";
import { NTabs, NTabPane } from "naive-ui";
import { useEventListener } from "@vueuse/core";
import { cloneDeep } from "lodash-es";
import DatabaseTable from "../DatabaseTable.vue";
import { Database, DatabaseId, Project, ProjectId, UNKNOWN_ID } from "@/types";
import {
  allowGhostMigration,
  allowUsingSchemaEditor,
  instanceHasAlterSchema,
  filterDatabaseByKeyword,
  sortDatabaseList,
} from "@/utils";
import {
  hasFeature,
  useCurrentUser,
  useDatabaseStore,
  useEnvironmentList,
  useProjectStore,
} from "@/store";
import ProjectStandardView, {
  State as ProjectStandardState,
} from "./ProjectStandardView.vue";
import ProjectTenantView, {
  State as ProjectTenantState,
} from "./ProjectTenantView.vue";
import SchemalessDatabaseTable from "./SchemalessDatabaseTable.vue";
import GhostDialog from "./GhostDialog.vue";
import SchemaEditorModal from "./SchemaEditorModal.vue";

type LocalState = ProjectStandardState &
  ProjectTenantState & {
    project?: Project;
    searchText: string;
    showSchemaLessDatabaseList: boolean;
    showSchemaEditorModal: boolean;
    showFeatureModal: boolean;
  };

const props = defineProps({
  projectId: {
    type: Number as PropType<ProjectId>,
    default: undefined,
  },
  type: {
    type: String as PropType<
      "bb.issue.database.schema.update" | "bb.issue.database.data.update"
    >,
    required: true,
  },
});

const emit = defineEmits(["dismiss"]);

const router = useRouter();

const currentUser = useCurrentUser();
const projectStore = useProjectStore();

const ghostDialog = ref<InstanceType<typeof GhostDialog>>();
const schemaEditorContext = ref<{
  databaseIdList: DatabaseId[];
}>({
  databaseIdList: [],
});

useEventListener(window, "keydown", (e) => {
  if (e.code === "Escape") {
    cancel();
  }
});

const state = reactive<LocalState>({
  project: props.projectId
    ? projectStore.getProjectById(props.projectId)
    : undefined,
  alterType: "MULTI_DB",
  selectedDatabaseIdListForEnvironment: new Map(),
  selectedDatabaseIdListForTenantMode: new Set<number>(),
  deployingTenantDatabaseList: [],
  label: "bb.environment",
  searchText: "",
  showSchemaLessDatabaseList: false,
  showSchemaEditorModal: false,
  showFeatureModal: false,
});

// Returns true if alter schema, false if change data.
const isAlterSchema = computed((): boolean => {
  return props.type === "bb.issue.database.schema.update";
});

const isTenantProject = computed((): boolean => {
  return state.project?.tenantMode === "TENANT";
});

if (isTenantProject.value) {
  // For tenant mode projects, alter multiple db via DeploymentConfig
  // is the default suggested way.
  state.alterType = "TENANT";
}

const environmentList = useEnvironmentList(["NORMAL"]);

const databaseList = computed(() => {
  const databaseStore = useDatabaseStore();
  let list;
  if (props.projectId) {
    list = databaseStore.getDatabaseListByProjectId(props.projectId);
  } else {
    list = databaseStore.getDatabaseListByPrincipalId(currentUser.value.id);
  }

  list = list.filter((db) => db.syncStatus === "OK");

  const keyword = state.searchText.trim();
  list = list.filter((db) =>
    filterDatabaseByKeyword(db, keyword, [
      "name",
      "environment",
      "instance",
      "project",
    ])
  );

  return sortDatabaseList(cloneDeep(list), environmentList.value);
});

const schemaDatabaseList = computed(() => {
  if (isAlterSchema.value) {
    return databaseList.value.filter((db) =>
      instanceHasAlterSchema(db.instance)
    );
  }

  return databaseList.value;
});

const schemalessDatabaseList = computed(() => {
  return databaseList.value.filter(
    (db) => !instanceHasAlterSchema(db.instance)
  );
});

const flattenSelectedDatabaseIdList = computed(() => {
  const flattenDatabaseIdList: DatabaseId[] = [];
  if (isTenantProject.value && state.alterType === "MULTI_DB") {
    for (const db of state.selectedDatabaseIdListForTenantMode) {
      flattenDatabaseIdList.push(db);
    }
  } else {
    for (const databaseIdList of state.selectedDatabaseIdListForEnvironment.values()) {
      flattenDatabaseIdList.push(...databaseIdList);
    }
  }
  return flattenDatabaseIdList;
});

const showGenerateMultiDb = computed(() => {
  if (isTenantProject.value) return false;
  return state.alterType === "MULTI_DB";
});

const allowGenerateMultiDb = computed(() => {
  return flattenSelectedDatabaseIdList.value.length > 0;
});

// 'normal' -> normal migration
// 'online' -> online migration
// false -> user clicked cancel button
const isUsingGhostMigration = async (databaseList: Database[]) => {
  // Gh-ost is not available for tenant mode yet.
  if (databaseList.some((db) => db.project.tenantMode === "TENANT")) {
    return "normal";
  }

  // never available for "bb.issue.database.data.update"
  if (props.type === "bb.issue.database.data.update") {
    return "normal";
  }

  // check if all selected databases supports gh-ost
  if (allowGhostMigration(databaseList)) {
    // open the dialog to ask the user
    const { result, mode } = await ghostDialog.value!.open();
    if (!result) {
      return false; // return false when user clicked the cancel button
    }
    return mode;
  }

  // fallback to normal
  return "normal";
};

// Also works when single db selected.
const generateMultiDb = async () => {
  const selectedDatabaseIdList = [...flattenSelectedDatabaseIdList.value];
  const selectedDatabaseList = selectedDatabaseIdList.map(
    (id) => schemaDatabaseList.value.find((db) => db.id === id)!
  );

  if (isAlterSchema.value && allowUsingSchemaEditor(selectedDatabaseList)) {
    schemaEditorContext.value.databaseIdList = cloneDeep(
      flattenSelectedDatabaseIdList.value
    );
    state.showSchemaEditorModal = true;
    return;
  }

  const mode = await isUsingGhostMigration(selectedDatabaseList);
  if (mode === false) {
    return;
  }

  const query: Record<string, any> = {
    template: props.type,
    name: generateIssueName(
      selectedDatabaseList.map((db) => db.name),
      mode === "online"
    ),
    project: props.projectId,
    // The server-side will sort the databases by environment.
    // So we need not to sort them here.
    databaseList: selectedDatabaseIdList.join(","),
  };
  if (mode === "online") {
    query.ghost = "1";
  }
  router.push({
    name: "workspace.issue.detail",
    params: {
      issueSlug: "new",
    },
    query,
  });
};

const showGenerateTenant = computed(() => {
  // True when a tenant project is selected and "TENANT" is selected.
  if (isTenantProject.value) {
    return true;
  }
  return false;
});

const allowGenerateTenant = computed(() => {
  if (isTenantProject.value && state.alterType === "MULTI_DB") {
    if (state.selectedDatabaseIdListForTenantMode.size === 0) {
      return false;
    }
  }

  if (isTenantProject.value) {
    // not allowed when database list filtered by deployment config is empty
    // which means no database will be deployed
    return state.deployingTenantDatabaseList.length > 0;
  }

  return true;
});

const getAllSelectionState = (
  databaseList: Database[]
): { checked: boolean; indeterminate: boolean } => {
  const set = state.selectedDatabaseIdListForTenantMode;

  const checked = databaseList.every((db) => set.has(db.id));
  const indeterminate = !checked && databaseList.some((db) => set.has(db.id));

  return {
    checked,
    indeterminate,
  };
};

const toggleAllDatabasesSelection = (
  databaseList: Database[],
  on: boolean
): void => {
  const set = state.selectedDatabaseIdListForTenantMode;
  if (on) {
    databaseList.forEach((db) => {
      set.add(db.id);
    });
  } else {
    databaseList.forEach((db) => {
      set.delete(db.id);
    });
  }
};

const isDatabaseSelected = (database: Database): boolean => {
  return state.selectedDatabaseIdListForTenantMode.has(database.id);
};

const toggleDatabaseSelection = (database: Database, on: boolean) => {
  if (on) {
    state.selectedDatabaseIdListForTenantMode.add(database.id);
  } else {
    state.selectedDatabaseIdListForTenantMode.delete(database.id);
  }
};

const generateTenant = async () => {
  if (!hasFeature("bb.feature.multi-tenancy")) {
    state.showFeatureModal = true;
    return;
  }

  const projectId = props.projectId;
  if (!projectId) return;

  const project = projectStore.getProjectById(projectId) as Project;

  if (project.id === UNKNOWN_ID) return;

  const query: Record<string, any> = {
    template: props.type,
    project: project.id,
    mode: "tenant",
  };
  if (state.alterType === "TENANT") {
    const databaseList = useDatabaseStore().getDatabaseListByProjectId(
      project.id
    );
    if (isAlterSchema.value && allowUsingSchemaEditor(databaseList)) {
      schemaEditorContext.value.databaseIdList = databaseList
        .filter((database) => database.syncStatus === "OK")
        .map((database) => database.id);
      state.showSchemaEditorModal = true;
      return;
    }
    // In tenant deploy pipeline, we use project name instead of database name
    // if more than one databases are to be deployed.
    const name = databaseList.length > 1 ? project.name : databaseList[0].name;
    query.name = generateIssueName([name], false);
    query.databaseName = "";
  } else {
    const databaseList: Database[] = [];
    const databaseStore = useDatabaseStore();
    for (const databaseId of state.selectedDatabaseIdListForTenantMode) {
      const database = databaseStore.getDatabaseById(databaseId);
      if (database.syncStatus === "OK") {
        databaseList.push(databaseStore.getDatabaseById(databaseId));
      }
    }
    if (isAlterSchema.value && allowUsingSchemaEditor(databaseList)) {
      schemaEditorContext.value.databaseIdList = Array.from(
        state.selectedDatabaseIdListForTenantMode.values()
      );
      state.showSchemaEditorModal = true;
      return;
    }

    query.name = generateIssueName(
      databaseList.map((database) => database.name),
      false
    );
    query.databaseList = Array.from(
      state.selectedDatabaseIdListForTenantMode
    ).join(",");
  }

  emit("dismiss");

  router.push({
    name: "workspace.issue.detail",
    params: {
      issueSlug: "new",
    },
    query,
  });
};

const selectDatabase = async (database: Database) => {
  if (
    isAlterSchema.value &&
    database.syncStatus === "OK" &&
    allowUsingSchemaEditor([database])
  ) {
    schemaEditorContext.value.databaseIdList = [database.id];
    state.showSchemaEditorModal = true;
    return;
  }

  const mode = await isUsingGhostMigration([database]);
  if (mode === false) {
    return;
  }
  emit("dismiss");

  const query: Record<string, any> = {
    template: props.type,
    name: generateIssueName([database.name], mode === "online"),
    project: database.project.id,
    databaseList: database.id,
  };
  if (mode === "online") {
    query.ghost = "1";
  }
  router.push({
    name: "workspace.issue.detail",
    params: {
      issueSlug: "new",
    },
    query,
  });
};

const cancel = () => {
  emit("dismiss");
};

const generateIssueName = (
  databaseNameList: string[],
  isOnlineMode: boolean
) => {
  // Create a user friendly default issue name
  const issueNameParts: string[] = [];
  if (databaseNameList.length === 1) {
    issueNameParts.push(`[${databaseNameList[0]}]`);
  } else {
    issueNameParts.push(`[${databaseNameList.length} databases]`);
  }
  if (isOnlineMode) {
    issueNameParts.push("Online schema change");
  } else {
    issueNameParts.push(isAlterSchema.value ? `Alter schema` : `Change data`);
  }
  const datetime = dayjs().format("@MM-DD HH:mm");
  const tz = "UTC" + dayjs().format("ZZ");
  issueNameParts.push(`${datetime} ${tz}`);

  return issueNameParts.join(" ");
};
</script>
