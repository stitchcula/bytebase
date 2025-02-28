import { defineStore } from "pinia";
import axios from "axios";
import {
  empty,
  EMPTY_ID,
  PrincipalId,
  Project,
  ProjectId,
  ProjectMember,
  ProjectPatch,
  ProjectState,
  ResourceIdentifier,
  ResourceObject,
  RowStatus,
  unknown,
  UNKNOWN_ID,
} from "@/types";
import { getPrincipalFromIncludedList } from "./principal";
import { isMemberOfProject } from "@/utils";

function convert(
  project: ResourceObject,
  includedList: ResourceObject[]
): Project {
  const attrs = project.attributes as Omit<Project, "id" | "memberList">;
  // Only able to assign an empty member list, otherwise would cause circular dependency.
  // This should be fine as we shouldn't access member via member.project.memberList
  const projectWithoutMemberList: Project = {
    id: parseInt(project.id),
    resourceId: attrs.resourceId,
    rowStatus: attrs.rowStatus,
    name: attrs.name,
    key: attrs.key,
    memberList: [],
    workflowType: attrs.workflowType,
    visibility: attrs.visibility,
    tenantMode: attrs.tenantMode,
    dbNameTemplate: attrs.dbNameTemplate,
    schemaChangeType: attrs.schemaChangeType,
  };

  const memberList: ProjectMember[] = [];
  for (const item of includedList || []) {
    if (item.type == "projectMember") {
      const projectMemberIdList = project.relationships!.projectMember
        .data as ResourceIdentifier[];
      for (const idItem of projectMemberIdList) {
        if (idItem.id == item.id) {
          const member = convertMember(item, includedList);
          member.project = projectWithoutMemberList;
          memberList.push(member);
        }
      }
    }
  }

  return {
    ...(projectWithoutMemberList as Omit<Project, "memberList">),
    memberList,
  };
}

// For now, this is exclusively used as part of converting the Project.
// Upon calling, the project itself is not constructed yet, so we return
// an unknown project first.
function convertMember(
  projectMember: ResourceObject,
  includedList: ResourceObject[]
): ProjectMember {
  const attrs = projectMember.attributes as Omit<ProjectMember, "project">;

  return {
    id: projectMember.id,
    role: attrs.role,
    // `project` will be overwritten after the value is correctly composed
    project: unknown("PROJECT") as Project,
    principal: getPrincipalFromIncludedList(
      projectMember.relationships!.principal.data,
      includedList
    ),
  };
}

export const useProjectStore = defineStore("project", {
  state: (): ProjectState => ({
    projectById: new Map(),
  }),
  getters: {
    projectList: (state) => {
      return [...state.projectById.values()];
    },
  },
  actions: {
    convert(instance: ResourceObject, includedList: ResourceObject[]): Project {
      return convert(instance, includedList || []);
    },

    getProjectListByUser(
      userId: PrincipalId,
      rowStatusList?: RowStatus[]
    ): Project[] {
      const result: Project[] = [];
      for (const [_, project] of this.projectById) {
        if (
          (!rowStatusList && project.rowStatus == "NORMAL") ||
          (rowStatusList && rowStatusList.includes(project.rowStatus))
        ) {
          if (isMemberOfProject(project, userId)) {
            result.push(project);
          }
        }
      }

      return result;
    },

    getProjectById(projectId: ProjectId): Project {
      if (projectId == EMPTY_ID) {
        return empty("PROJECT") as Project;
      }

      return this.projectById.get(projectId) || (unknown("PROJECT") as Project);
    },

    async getOrFetchProjectById(projectId: ProjectId): Promise<Project> {
      if (projectId === EMPTY_ID) return empty("PROJECT");
      if (projectId === UNKNOWN_ID) return unknown("PROJECT");
      if (!this.projectById.has(projectId)) {
        await this.fetchProjectById(projectId);
      }
      return this.getProjectById(projectId);
    },

    async fetchAllProjectList() {
      const data = (await axios.get(`/api/project`)).data;
      const projectList = data.data.map((project: ResourceObject) => {
        return convert(project, data.included);
      }) as Project[];

      this.upsertProjectList(projectList);
      return projectList;
    },

    async fetchProjectListByUser({
      userId,
      rowStatusList = [],
    }: {
      userId: PrincipalId;
      rowStatusList?: RowStatus[];
    }) {
      const projectList: Project[] = [];

      const fetchProjectList = async (rowStatus?: RowStatus) => {
        let path = `/api/project?user=${userId}`;
        if (rowStatus) path += `&rowstatus=${rowStatus}`;
        const data = (await axios.get(path)).data;
        const list: Project[] = data.data.map((project: ResourceObject) => {
          return convert(project, data.included);
        });
        // projects are mutual excluded by different rowstatus
        // so we don't need to unique them by id here
        projectList.push(...list);
      };

      if (rowStatusList.length === 0) {
        // if no rowStatus specified, fetch all
        await fetchProjectList();
      } else {
        // otherwise, fetch different rowStatus one-by-one
        for (const rowStatus of rowStatusList) {
          await fetchProjectList(rowStatus);
        }
      }

      this.upsertProjectList(projectList);
      return projectList;
    },

    async fetchProjectById(projectId: ProjectId) {
      const data = (await axios.get(`/api/project/${projectId}`)).data;
      const project = convert(data.data, data.included);

      this.setProjectById({
        projectId,
        project,
      });
      return project;
    },

    async patchProject({
      projectId,
      projectPatch,
    }: {
      projectId: ProjectId;
      projectPatch: ProjectPatch;
    }) {
      const data = (
        await axios.patch(`/api/project/${projectId}`, {
          data: {
            type: "projectPatch",
            attributes: projectPatch,
          },
        })
      ).data;
      const updatedProject = convert(data.data, data.included);

      this.setProjectById({
        projectId,
        project: updatedProject,
      });

      return updatedProject;
    },

    // sync member role from vcs
    async syncMemberRoleFromVCS({ projectId }: { projectId: ProjectId }) {
      await axios.post(`/api/project/${projectId}/sync-member`);
      const updatedProject = await this.fetchProjectById(projectId);

      return updatedProject;
    },

    setProjectById({
      projectId,
      project,
    }: {
      projectId: ProjectId;
      project: Project;
    }) {
      this.projectById.set(projectId, project);
    },

    upsertProjectList(projectList: Project[]) {
      for (const project of projectList) {
        this.projectById.set(project.id, project);
      }
    },
  },
});
