<template>
  <div class="flex flex-col space-y-4">
    <template v-if="state.migrationHistorySectionList.length > 0">
      <div class="text-center textinfolabel">
        {{ $t("change-history.list-limit") }}
      </div>
      <MigrationHistoryTable
        :mode="'PROJECT'"
        :database-section-list="state.databaseSectionList"
        :history-section-list="state.migrationHistorySectionList"
      />
    </template>
    <template v-else>
      <!-- This example requires Tailwind CSS v2.0+ -->
      <div class="text-center">
        <heroicons-outline:inbox class="mx-auto w-16 h-16 text-control-light" />
        <h3 class="mt-2 text-sm font-medium text-main">
          {{ $t("change-history.no-history-in-project") }}
        </h3>
        <p class="mt-1 text-sm text-control-light">
          {{ $t("change-history.recording-info") }}
        </p>
      </div>
    </template>
  </div>
</template>

<script lang="ts" setup>
import { PropType, reactive, watchEffect } from "vue";
import MigrationHistoryTable from "../components/MigrationHistoryTable.vue";
import { Database, InstanceMigration, MigrationHistory } from "../types";
import { BBTableSectionDataSource } from "../bbkit/types";
import { fullDatabasePath } from "../utils";
import { useInstanceStore } from "@/store";

// Show at most 5 recent migration history for each database
const MAX_MIGRATION_HISTORY_COUNT = 5;

interface LocalState {
  databaseSectionList: Database[];
  migrationHistorySectionList: BBTableSectionDataSource<MigrationHistory>[];
}

const props = defineProps({
  databaseList: {
    required: true,
    type: Object as PropType<Database[]>,
  },
});

const instanceStore = useInstanceStore();

const state = reactive<LocalState>({
  databaseSectionList: [],
  migrationHistorySectionList: [],
});

const fetchMigrationHistory = (databaseList: Database[]) => {
  state.databaseSectionList = [];
  state.migrationHistorySectionList = [];
  for (const database of databaseList) {
    instanceStore
      .checkMigrationSetup(database.instance.id)
      .then((migration: InstanceMigration) => {
        if (migration.status == "OK") {
          instanceStore
            .fetchMigrationHistory({
              instanceId: database.instance.id,
              databaseName: database.name,
              limit: MAX_MIGRATION_HISTORY_COUNT,
            })
            .then((migrationHistoryList: MigrationHistory[]) => {
              if (migrationHistoryList.length > 0) {
                state.databaseSectionList.push(database);

                const title = `${database.name} (${database.instance.environment.name})`;
                const index = state.migrationHistorySectionList.findIndex(
                  (item: BBTableSectionDataSource<MigrationHistory>) => {
                    return item.title == title;
                  }
                );
                const newItem = {
                  title: title,
                  link: `${fullDatabasePath(database)}#change-history`,
                  list: migrationHistoryList,
                };
                if (index >= 0) {
                  state.migrationHistorySectionList[index] = newItem;
                } else {
                  state.migrationHistorySectionList.push(newItem);
                }
              }
            });
        }
      });
  }
};

const prepareMigrationHistoryList = () => {
  fetchMigrationHistory(props.databaseList);
};
watchEffect(prepareMigrationHistoryList);
</script>
