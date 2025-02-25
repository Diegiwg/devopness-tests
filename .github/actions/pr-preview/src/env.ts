export class Env {
    public applicationId: number;
    public credentialId: number;
    public databaseFileId: number;
    public devopnessAPPUrl: string;
    public environmentId: number;
    public prBranchName: string;
    public prNumber: number;
    public projectId: number;
    public repository: string;
    public serverId: number;

    constructor(
        credentialId: number,
        databaseFileId: number,
        devopnessAPPUrl: string,
        environmentId: number,
        prBranchName: string,
        prNumber: number,
        projectId: number,
        repository: string,
        serverId: number,
    ) {
        this.applicationId = undefined as any;

        this.credentialId = credentialId;
        this.databaseFileId = databaseFileId;
        this.devopnessAPPUrl = devopnessAPPUrl;
        this.environmentId = environmentId;
        this.prBranchName = prBranchName;
        this.prNumber = prNumber;
        this.projectId = projectId;
        this.repository = repository;
        this.serverId = serverId;
    }
}
