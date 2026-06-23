# DeepexiLab 2.0 Agent Native

This context defines the product language for DeepexiLab 2.0 Agent Native. It keeps the core terms stable while PRD, design, and engineering plans evolve.

## Language

**Lab Agent Workspace**:
The unified Agent entry and work surface for DeepexiLab 2.0. It opens from the platform Agent entry or external links and lets users access conversations, experiment archives, experiment reports, comparisons, SkillHub, and MCP capabilities.
_Avoid_: Chatbot page, report center, diagnosis panel

**Experiment Archive**:
The DeepexiLab 2.0 workspace for experiment-class assets. It contains Experiment Reports, Data Reports, Experiment Comparisons, and Experiment Log Details while referencing platform data, training, evaluation, Notebook, Skill, and Agent evidence without replacing those source objects.
_Avoid_: Training task, single report document, chat session

**Experiment Report**:
A versioned summary report for one goal-driven Agent, CLI, MCP, or Agent Bridge work item, including pure data processing or comparison work. It is grouped by the user's overall goal rather than by capability category, links to detail assets such as Data Reports or Experiment Comparisons when needed, and notifies the user after generation.
_Avoid_: Draft report, training report as the default term

**Platform Audit Record**:
A system-level trace of important platform operations, including who performed an action, when it happened, which object was affected, and through which channel it was triggered. It is not a primary 2.0 user workspace entry; user-facing history stays with the relevant platform object, Agent conversation, or Experiment Archive asset.
_Avoid_: Experiment report, user-facing activity feed as the default term

**Experiment Comparison**:
A comparison asset that can compare versions, datasets, evaluations, or experiment archives. It is maintained as one independent asset and can be referenced by one or more Experiment Reports.
_Avoid_: Inline-only report section, duplicated comparison copy

**Data Processing and Analysis**:
The Agent Native capability for data processing, data comparison, data applicability analysis, abnormal sample review, and dataset version writeback. Its primary output is a Data Report, not a generic quality score for every dataset.
_Avoid_: Generic data quality scoring, report-only data section

**Data Report**:
A data-side report generated from a goal-driven data processing, analysis, comparison, or applicability task. It can be referenced by one or more Experiment Reports and remains distinct from platform data service records.
_Avoid_: Universal data quality report, dataset detail page

**Experiment Log Details**:
A detail asset for logs collected from platform tasks, Notebook, SSH, CLI, or external Agent runs. Experiment Reports include log conclusions directly and reference log details only for original snippets, sources, and traceability.
_Avoid_: Separate log analysis report as a main user entry

**Lab SkillHub**:
The governed skill library for reusable Notebook, Agent, and platform operations. It includes system built-in skills with user-readable summaries and custom skills authored or imported as editable Skill documents, while platform rules such as permission checks and version freezing stay outside the skill layer.
_Avoid_: Script marketplace, plugin store

**Custom Skill**:
A user- or project-authored Skill maintained as an editable Skill document, usually `SKILL.md` plus optional references. It can be imported, installed through Agent, edited in SkillHub, and written back by Agent when the user authorizes the change.
_Avoid_: Low-code form only, arbitrary ungoverned script

**DeepexiLab Agent Bridge**:
The official connection layer that lets Notebook, SSH, IDE tools, CLI workflows, and external Agents access DeepexiLab through authenticated CLI, MCP, and controlled platform APIs. It exists so external tools can cooperate with the platform without bypassing permissions, confirmation, or audit.
_Avoid_: CLI helper, external Agent integration as a side feature

**MCP Directory**:
The governed catalog for system MCP capabilities and user-installed MCP connections. System MCP exposes DeepexiLab platform capabilities under account permissions, while personal MCP entries are configured by the user and shown in the same product area.
_Avoid_: Another SkillHub, hidden integration settings

**Context Pack**:
A permission-filtered package of project, data, task, evaluation, model, environment, and archive context made available to Lab Agent Workspace or DeepexiLab Agent Bridge consumers.
_Avoid_: Full database export, raw prompt context

## Example Dialogue

Product: "When a Notebook or external IDE run creates experiment evidence that the platform cannot fully carry as a normal task or dataset object, DeepexiLab should create or update an Experiment Archive."

Engineer: "Does that mean the archive owns the dataset and training task?"

Product: "No. Platform-native objects stay in their owning modules. The Experiment Archive references them and creates an Experiment Report only when there is a goal-driven reasoning result, comparison, or external experiment context to preserve."

Engineer: "If an IDE Agent wants to append results, does it call the platform directly?"

Product: "No. It uses DeepexiLab Agent Bridge through CLI or MCP, with the user's authenticated permissions and audit trail."
