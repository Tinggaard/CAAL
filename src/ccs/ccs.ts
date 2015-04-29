/// <reference path="../../lib/util.d.ts" />
/// <reference path="unguarded_recursion.ts" />

module CCS {

    export type ProcessId = number;

    export interface Process {
        id : ProcessId;
        dispatchOn<T>(dispatcher : ProcessDispatchHandler<T>) : T;
    }

    export interface ProcessDispatchHandler<T> {
        dispatchNullProcess(process : NullProcess, ... args) : T
        dispatchNamedProcess(process : NamedProcess, ... args) : T
        dispatchSummationProcess(process : SummationProcess, ... args) : T
        dispatchCompositionProcess(process : CompositionProcess, ... args) : T
        dispatchActionPrefixProcess(process : ActionPrefixProcess, ... args) : T
        dispatchRestrictionProcess(process : RestrictionProcess, ... args) : T
        dispatchRelabellingProcess(process : RelabellingProcess, ... args) : T
    }

    export interface CollapsedDispatchHandler<T> extends ProcessDispatchHandler<T> {
        dispatchCollapsedProcess(process : CollapsedProcess, ... args) : T
    }

    export interface ProcessVisitor<T> {
        visit(process : Process) : T;
    }

    export interface SuccessorGenerator {
        getGraph() : Graph;
        getProcessByName(processName : string) : Process;
        getProcessById(processId : ProcessId) : Process;
        getSuccessors(processId : ProcessId) : TransitionSet;
    }

    export interface Transition {
        action?: Action;
        delay?: TCCS.Delay;
        targetProcess: Process;
        equals(other : Transition): boolean;
        toString(): string;
    }

    export class NullProcess implements Process {
        constructor(public id : ProcessId) {
        }
        dispatchOn<T>(dispatcher : ProcessDispatchHandler<T>) : T {
            return dispatcher.dispatchNullProcess(this);
        }
        toString() {
            return "NullProcess";
        }
    }

    export class NamedProcess implements Process {
        constructor(public id : ProcessId, public name : string, public subProcess : Process) {
        }
        dispatchOn<T>(dispatcher : ProcessDispatchHandler<T>) : T {
            return dispatcher.dispatchNamedProcess(this);
        }
        toString() {
            return "NamedProcess(" + this.name +")";
        }
    }

    export class SummationProcess implements Process {
        constructor(public id : ProcessId, public subProcesses : Process[]) {
        }
        dispatchOn<T>(dispatcher : ProcessDispatchHandler<T>) : T {
            return dispatcher.dispatchSummationProcess(this);
        }
        toString() {
            return "Summation";
        }
    }

    export class CompositionProcess implements Process {
        constructor(public id : ProcessId, public subProcesses : Process[]) {
        }
        dispatchOn<T>(dispatcher : ProcessDispatchHandler<T>) : T {
            return dispatcher.dispatchCompositionProcess(this);
        }
        toString() {
            return "Composition";
        }
    }

    export class ActionPrefixProcess implements Process {
        constructor(public id : ProcessId, public action : Action, public nextProcess : Process) {
        }
        dispatchOn<T>(dispatcher : ProcessDispatchHandler<T>) : T {
            return dispatcher.dispatchActionPrefixProcess(this);
        }
        toString() {
            return "Action(" + this.action.toString() + ")";
        }
    }
    
    export class RestrictionProcess implements Process {
        constructor(public id : ProcessId, public subProcess : Process, public restrictedLabels : LabelSet) {
        }
        dispatchOn<T>(dispatcher : ProcessDispatchHandler<T>) : T {
            return dispatcher.dispatchRestrictionProcess(this);
        }
        toString() {
            return "Restriction";
        }
    }

    export class RelabellingProcess implements Process {
        constructor(public id : ProcessId, public subProcess : Process, public relabellings : RelabellingSet) {
        }
        dispatchOn<T>(dispatcher : ProcessDispatchHandler<T>) : T {
            return dispatcher.dispatchRelabellingProcess(this);
        }
        toString() {
            return "Relabelling";
        }
    }

    export class CollapsedProcess implements Process {
        constructor(public id : ProcessId, public subProcesses : Process[]) {
        }
        dispatchOn<T>(dispatcher : CollapsedDispatchHandler<T>) : T {
            return dispatcher.dispatchCollapsedProcess(this);
        }
        toString() {
            return "CollapsedProcess";
        }
    }

    export class Action {
        private label : string;
        private complement : boolean;

        constructor(label : string, isComplement : boolean) {
            if (label === "tau" && isComplement) {
                throw newError("TauNoComplement", "Tau has no complement.");
            }
            this.label = label;
            this.complement = isComplement;
        }

        getLabel() : string {
            return this.label;
        }

        isComplement() : boolean {
            return this.complement;
        }

        equals(other : Action) {
            return this.label === other.label &&
                this.complement === other.complement;
        }
        toString() {
            return (this.complement ? "'" : "") + this.label;
        }
        clone() {
            return new Action(this.label, this.complement);
        }
    }

    interface Error {
        name : string;
        message : string;
    }

    function newError(type, message) : Error {
        var error = new Error(message);
        error.name = type;
        return error;
    }

    export class Graph {
        protected nextId : number = 1;
        private nullProcess = new NullProcess(0);
        protected structural = Object.create(null);
        protected processes = {0: this.nullProcess};
        private namedProcesses = Object.create(null);
        private constructErrors = [];
        private definedSets = Object.create(null);
        //Uses index as uid.
        private allRestrictedSets = new GrowingIndexedArraySet<LabelSet>();
        private allRelabellings = new GrowingIndexedArraySet<RelabellingSet>();
        protected unguardedRecursionChecker = new Traverse.UnguardedRecursionChecker();

        constructor() {
        }

        newNamedProcess(processName : string, process : Process) {
            var namedProcess = this.namedProcesses[processName];
            if (!namedProcess) {
                namedProcess = this.namedProcesses[processName] = new NamedProcess(this.nextId++, processName, process);
                this.processes[namedProcess.id] = namedProcess;
            } else if (!namedProcess.subProcess) {
                namedProcess.subProcess = process;
            } else {
                this.constructErrors.push(newError("DuplicateProcessDefinition", "Duplicate definition of process '" + processName + "'."));
            }
            return namedProcess;
        }

        referToNamedProcess(processName : string) {
            var namedProcess = this.namedProcesses[processName];
            if (!namedProcess) {
                //Null will be fixed, by newNamedProcess
                namedProcess = this.namedProcesses[processName] = new NamedProcess(this.nextId++, processName, null);
                this.processes[namedProcess.id] = namedProcess;
            }
            return namedProcess;
        }

        getNullProcess() {
            return this.nullProcess;
        }

        newActionPrefixProcess(action : Action, nextProcess : Process) {
            var key = "." + action.toString() + "." + nextProcess.id;
            var existing = this.structural[key];
            if (!existing) {
                existing = this.structural[key] = new ActionPrefixProcess(this.nextId++, action, nextProcess);
                this.processes[existing.id] = existing;
            }
            return existing;
        }

        newSummationProcess(subProcesses : Process[]) {
            var temp, key, existing;
            //Ensure left.id <= right.id
            var newProcesses = subProcesses.slice(0);
            newProcesses.sort((procA, procB) => procA.id - procB.id);
            key = "+" + newProcesses.map(proc => proc.id).join(",");
            existing = this.structural[key];
            if (!existing) {
                existing = this.structural[key] = new SummationProcess(this.nextId++, newProcesses);
                this.processes[existing.id] = existing;
            }
            return existing;
        }

        newCompositionProcess(subProcesses : Process[]) {
            var temp, key, existing;
            //Ensure left.id <= right.id
            var newProcesses = subProcesses.slice(0);
            newProcesses.sort((procA, procB) => procA.id - procB.id);
            key = "|" + newProcesses.map(proc => proc.id).join(",");
            existing = this.structural[key];
            if (!existing) {
                existing = this.structural[key] = new CompositionProcess(this.nextId++, newProcesses);
                this.processes[existing.id] = existing;
            }
            return existing;
        }

        newRestrictedProcess(process, restrictedLabels : LabelSet) {
            //For now return just new instead of structural sharing
            var key, existing;
            restrictedLabels = this.allRestrictedSets.getOrAdd(restrictedLabels);
            key = "\\" + process.id + "," + this.allRestrictedSets.indexOf(restrictedLabels);
            existing = this.structural[key];
            if (!existing) {
                existing = this.structural[key] = new RestrictionProcess(this.nextId++, process, restrictedLabels);
                this.processes[existing.id] = existing;
            }
            return existing;
        }

        newRestrictedProcessOnSetName(process, setName) {
            var labelSet = this.definedSets[setName];
            if (!labelSet) {
                this.constructErrors.push(newError("UndefinedSet", "Set '" + setName + "' has not been defined."));
                //Fallback for empty set
                labelSet = this.allRestrictedSets.getOrAdd(new LabelSet([]));
            }
            return this.newRestrictedProcess(process, labelSet);
        }

        newRelabelingProcess(process, relabellings : RelabellingSet) {
            var key, existing;
            relabellings = this.allRelabellings.getOrAdd(relabellings);
            key = "[" + process.id + "," + this.allRelabellings.indexOf(relabellings);
            existing = this.structural[key];
            if (!existing) {
                existing = this.structural[key] = new RelabellingProcess(this.nextId++, process, relabellings);
                this.processes[existing.id] = existing;
            }
            return existing;
        }

        newCollapsedProcess(subProcesses : Process[]) {
            var key, existing;
            var newProcesses = subProcesses.slice(0);
            newProcesses.sort((procA, procB) => procA.id - procB.id);
            key = "collapse," + newProcesses.map(proc => proc.id).join(",");
            existing = this.structural[key];
            if (!existing) {
                existing = this.structural[key] = new CollapsedProcess(this.nextId++, newProcesses);
                this.processes[existing.id] = existing;
            }
            return existing;
        }

        defineNamedSet(name, labelSet : LabelSet) {
            if (this.definedSets[name]) {
                this.constructErrors.push(newError("DuplicateSetDefinition", "Duplicate definition of set '" + name + "'."));
            }
            this.definedSets[name] = this.allRestrictedSets.getOrAdd(labelSet);
        }

        processById(id : ProcessId) : Process {
            return this.processes[id] || null;
        }

        processByName(name : string) : Process {
            return this.namedProcesses[name] || null;
        }

        getNamedProcesses() {
            return Object.keys(this.namedProcesses);
        }

        getErrors() {
            var errors = this.constructErrors.slice(0);
            //Add undefined processes
            var addUndefinedProcesses = () => {
                var processName, process;
                for (processName in this.namedProcesses) {
                    process = this.namedProcesses[processName];
                    if (!process.subProcess) {
                        errors.push(newError("UndefinedProcess", "Process '" + processName + "' has not been defined."));
                    }
                }
            }
            var addUnguardedRecursionErrors = () => {
                var processNames = Object.keys(this.namedProcesses),
                    processes = processNames.map(name => this.namedProcesses[name]),
                    unguardedProcesses = this.unguardedRecursionChecker.findUnguardedProcesses(processes);
                unguardedProcesses.forEach(process => {
                    errors.push(newError("UnguardedProcess", "Process '" + process.name + "' has unguarded recursion."));
                });
            }
            addUndefinedProcesses();
            //Unguarded recursion checking requires all processes to defined.
            if (errors.length === 0) addUnguardedRecursionErrors();
            return errors;
        }
    }

    export class RelabellingSet {
        private froms = [];
        private tos = [];

        constructor(relabellings : {from: string; to: string}[]) {
            relabellings.forEach( (relabel) => {
                if (relabel.from === "tau") {
                    throw newError("TauRelabel", "Cannot relabel tau.");
                }
                this.froms.push(relabel.from);
                this.tos.push(relabel.to);
            });
            this.froms.sort();
            this.tos.sort();
        }

        forEach(f : (from : string, to : string) => void, thisObject?) {
            for (var i = 0, max = this.froms.length; i < max; i++) {
                f.call(thisObject, this.froms[i], this.tos[i]);
            }
        }

        hasRelabelForLabel(label : string ) : boolean {
            return this.froms.indexOf(label) !== -1;
        }

        relabeledActionFor(action : Action) : Action {
            var index = this.froms.indexOf(action.getLabel()),
                result = null,
                newLabel;
            if (index >= 0) {
                newLabel = this.tos[index];
                //Tau cannot be complemented.
                result = newLabel === "tau" ? new Action(newLabel, false) : new Action(newLabel, action.isComplement());
            }
            return result;
        }

        equals(other : RelabellingSet) {
            if (other === this) return true;
            if (other.froms.length !== this.froms.length) return false;
            for (var i = 0; i < this.froms.length; i++) {
                if (this.froms[i] !== other.froms[i]) return false;
                if (this.tos[i] !== other.tos[i]) return false;
            }
            return true;
        }

        toString() : string {
            return "RelabellingSet";
        }
    }

    export class LabelSet {
        private labels : string[] = [];

        constructor(labels : string[]) {
            this.labels = ArrayUtil.sortAndRemoveDuplicates(labels);
            if (this.contains("tau")) {
                throw newError("TauInLabelSet", "Tau is not allowed in label set.");
            }
        }

        toArray() : string[] {
            return this.labels.slice(0);
        }

        contains(label : string) : boolean {
            return this.labels.indexOf(label) !== -1;
        }

        empty() : boolean {
            return this.count() === 0;
        }

        count() : number {
            return this.labels.length;
        }

        forEach(f : (label : string) => void, thisObject?) {
            if (thisObject) {
                this.labels.forEach(label => f.call(this, label));
            } else {
                this.labels.forEach(label => f(label))
            }
        }

        equals(other : LabelSet) {
            var myLabels = this.labels,
                otherLabels = other.labels;
            if (other === this) return true;
            if (myLabels.length !== other.labels.length) return false;
            for (var i = 0; i < myLabels.length; i++) {
                if (myLabels[i] !== otherLabels[i]) return false;
            }
            return true;
        }

        union(other : LabelSet) : LabelSet {
            return LabelSet.Union(this, other);
        }

        static Union(... sets : LabelSet[]) {
            var result = new LabelSet([]);
            sets.forEach(set => {
                set.labels.forEach(label => {
                    if (!result.contains(label)) {
                        result.labels.push(label);
                    }
                });
            });
            result.labels.sort();
            return result;
        }

        toString() {
            return "LabelSet";
        }
    }

    /*
        Always modifies inplace. Clone gives shallow clone
    */
    export class ActionTransition implements Transition {

        constructor(public action : Action = null, public targetProcess : Process = null, public delay = null) {
        }

        equals(other : Transition) {
            if (!(other instanceof ActionTransition)) {
                return false;
            }
            
            return (this.action.equals(other.action) && this.targetProcess.id == other.targetProcess.id);
        }

        toString() {
            if (this.targetProcess instanceof NamedProcess) {
                return this.action.toString() + "->" + (<NamedProcess>this.targetProcess).name;
            }
            return this.action.toString() + "->" + this.targetProcess.id;
        }
    }

    export class TransitionSet {
        private transitions : Transition[] = [];

        constructor(transitions? : Transition[]) {
            if (transitions) {
                this.addMany(transitions);
            }
        }

        add(transition : Transition) : void {
            var index = this.indexOf(transition);
            if (index === -1) {
                this.transitions.push(transition);
            }
        }

        contains(transition : Transition) : boolean {
            return this.indexOf(transition) !== -1;
        }

        private indexOf(transition : Transition) : number {
            var allCurrent = this.transitions;
            for (var i = 0, max = allCurrent.length; i < max; i++){
                if (transition.equals(allCurrent[i])) return i;
            }
            return -1;
        }

        addMany(transitions : Transition[]) : void {
            for (var i = 0, max = transitions.length; i < max; i++){
                this.add(transitions[i]);
            }
        }

        unionWith(tSet : TransitionSet) : TransitionSet {
            this.addMany(tSet.transitions);
            return this;
        }

        clone() : TransitionSet {
            return new TransitionSet(this.transitions);
        }

        count() : number {
            return this.transitions.length;
        }

        applyRestrictionSet(labels : LabelSet) : TransitionSet {
            var count = this.transitions.length,
                allCurrent = this.transitions,
                i = 0;
            while (i < count) {
                if (allCurrent[i] instanceof ActionTransition && labels.contains(allCurrent[i].action.getLabel())) {
                    allCurrent[i] = allCurrent[--count];
                } else {
                    ++i;
                }
            }
            allCurrent.length = count;
            return this;
        }

        applyRelabelSet(relabels : RelabellingSet) : void {
            var allCurrent = this.transitions,
                newAction, oldAction, transition;
            for (var i = 0, max = allCurrent.length; i < max; i++) {
                if (allCurrent[i] instanceof ActionTransition){
                    transition = allCurrent[i];
                    oldAction = transition.action;
                    if (relabels.hasRelabelForLabel(transition.action.label)) {
                        newAction = relabels.relabeledActionFor(transition.action);
                        allCurrent[i] = new ActionTransition(newAction, transition.targetProcess);
                    }
                }
            }
        }

        possibleActions() : Action[] {
            var actions = [],
                action, found;
            for (var i = 0; i < this.transitions.length; i++) {
                action = this.transitions[i].action;
                found = false;
                for (var j = 0; j < actions.length; j++) {
                    if (action.equals(actions[j])) {
                        found = true;
                        break;
                    }
                }
                if (!found) actions.push(action);
            }
            return actions;
        }

        transitionsForAction(action : Action) : Transition[] {
            return this.transitions.filter((transition) => action.equals(transition.action));
        }

        forEach(f : (transition : Transition) => any) {
            for (var i = 0, max = this.transitions.length; i < max; i++){
                f(this.transitions[i]);
            }
        }

        toArray() : Transition[] {
            return this.transitions.slice(0);
        }
    }

    export class StrictSuccessorGenerator implements SuccessorGenerator, ProcessDispatchHandler<TransitionSet> {

        constructor(public graph : Graph, public cache?) {
            this.cache = cache || {};
        }

        getGraph() {
            return this.graph;
        }

        getSuccessors(processId : ProcessId) : TransitionSet {
            //Move recursive calling into loop with stack here
            //if overflow becomes an issue.
            var process = this.graph.processById(processId);
            return this.cache[process.id] = process.dispatchOn(this);
        }

        getProcessByName(processName : string) : Process {
            return this.graph.processByName(processName);
        }

        getProcessById(processId : ProcessId) : Process {
            return this.graph.processById(processId);
        }

        dispatchNullProcess(process : NullProcess) {
            var transitionSet = this.cache[process.id];
            if (!transitionSet) {
                transitionSet = this.cache[process.id] = new TransitionSet();
            }
            return transitionSet;
        }

        dispatchNamedProcess(process : NamedProcess) {
            var transitionSet = this.cache[process.id];
            if (!transitionSet) {
                //Assume nothing, then figure it out when subprocess successors are known.
                this.cache[process.id] = new TransitionSet();
                transitionSet = this.cache[process.id] = process.subProcess.dispatchOn(this).clone();
            }
            return transitionSet;
        }

        dispatchSummationProcess(process : SummationProcess) {
            var transitionSet = this.cache[process.id];
            if (!transitionSet) {
                transitionSet = this.cache[process.id] = new TransitionSet();
                process.subProcesses.forEach(subProcess => {
                    transitionSet.unionWith(subProcess.dispatchOn(this));
                });
            }
            return transitionSet;
        }

        dispatchCompositionProcess(process : CompositionProcess) {
            var transitionSet = this.cache[process.id],
                leftSet, rightSet;
            if (!transitionSet) {
                transitionSet = this.cache[process.id] = new TransitionSet();
                var subTransitionSets = process.subProcesses.map(subProc => subProc.dispatchOn(this));
                //COM3s
                for (var i=0; i < subTransitionSets.length-1; i++) {
                    for (var j=i+1; j < subTransitionSets.length; j++) {
                        //For each pairs in  P1 | P2 | P3 | P4, find COM3 transitions.
                        var left = subTransitionSets[i];
                        var right = subTransitionSets[j];
                        left.forEach(leftTransition => {
                            right.forEach(rightTransition => {
                                if (leftTransition.action.getLabel() === rightTransition.action.getLabel() &&
                                    leftTransition.action.isComplement() !== rightTransition.action.isComplement()) {
                                    //Need to construct entire set of new process.
                                    var targetSubprocesses = process.subProcesses.slice(0);
                                    targetSubprocesses[i] = leftTransition.targetProcess;
                                    targetSubprocesses[j] = rightTransition.targetProcess;
                                    transitionSet.add(new ActionTransition(new Action("tau", false),
                                        this.graph.newCompositionProcess(targetSubprocesses)));
                                }
                            });
                        });
                    }
                }
                //COM1/2s
                subTransitionSets.forEach( (subTransitionSet, index) => {
                    subTransitionSet.forEach(subTransition => {
                        var targetSubprocesses = process.subProcesses.slice(0);
                        //Only the index of the subprocess will have changed.
                        targetSubprocesses[index] = subTransition.targetProcess;
                        transitionSet.add(new ActionTransition(subTransition.action.clone(),
                            this.graph.newCompositionProcess(targetSubprocesses)));
                    });
                });
            }
            return transitionSet;
        }

        dispatchActionPrefixProcess(process : ActionPrefixProcess) {
            var transitionSet = this.cache[process.id];
            if (!transitionSet) {
                //process.nextProcess.dispatchOn(this).clone();
                transitionSet = this.cache[process.id] = new TransitionSet([new ActionTransition(process.action, process.nextProcess)]);
            }
            return transitionSet;
        }

        dispatchRestrictionProcess(process : RestrictionProcess) {
            var transitionSet = this.cache[process.id],
                subTransitionSet;
            if (!transitionSet) {
                transitionSet = this.cache[process.id] = new TransitionSet();
                subTransitionSet = process.subProcess.dispatchOn(this).clone();
                subTransitionSet.applyRestrictionSet(process.restrictedLabels);
                subTransitionSet.forEach(transition => {
                    var newRestriction = this.graph.newRestrictedProcess(transition.targetProcess, process.restrictedLabels);
                    transitionSet.add(new ActionTransition(transition.action.clone(), newRestriction));
                });
            }
            return transitionSet;
        }

        dispatchRelabellingProcess(process : RelabellingProcess) {
            var transitionSet = this.cache[process.id],
                subTransitionSet;
            if (!transitionSet) {
                transitionSet = this.cache[process.id] = new TransitionSet();
                subTransitionSet = process.subProcess.dispatchOn(this).clone();
                subTransitionSet.applyRelabelSet(process.relabellings);
                subTransitionSet.forEach(transition => {
                    var newRelabelling = this.graph.newRelabelingProcess(transition.targetProcess, process.relabellings);
                    transitionSet.add(new ActionTransition(transition.action.clone(), newRelabelling));
                });
            }
            return transitionSet;
        }
    }

    export class GrowingIndexedArraySet<T> {
            
        private elements = [];

        constructor() { }

        getOrAdd(element : T) : T {
            var result = element,
                index = this.indexOf(element);
            if (element === undefined || element === null) throw "Bad argument to getOrAdd";
            if (index === -1) {
                this.elements.push(element);
            } else {
                result = this.elements[index];
            }
            return result;
        }

        get(index : number) : T {
            return index >= this.elements.length ? null : this.elements[index];
        }

        indexOf(element : T) : number {
            for (var i = 0; i < this.elements.length; i++) {
                if (this.elements[i].equals(element)) return i;
            }
            return -1;
        }
    }

    export function getSuccGenerator(graph, options) {
        var settings = {inputMode: "CCS", succGen: "strong", reduce: true},
            resultGenerator : SuccessorGenerator = new StrictSuccessorGenerator(graph);
        for (var optionName in options) {
            settings[optionName] = options[optionName];
        }
        if (settings.inputMode === "CCS") {
            if (settings.reduce) {
                var treeReducer = new Traverse.ProcessTreeReducer(graph);
                resultGenerator = new Traverse.ReducingSuccessorGenerator(resultGenerator, treeReducer);
            }
            if (settings.succGen === "weak") {
                resultGenerator = new Traverse.WeakSuccessorGenerator(resultGenerator);
            }
            return resultGenerator;
        } else {
            return new TCCS.StrictSuccessorGenerator(graph);
        }
    }

    export function getNSuccessors(succGen : CCS.SuccessorGenerator, process : CCS.Process, maxDepth : number) : any {
        var result = {},
            queue = [[1, process]],
            depth, fromProcess, transitions;

        for (var i = 0; i < queue.length; i++) {
            depth = queue[i][0];
            fromProcess = queue[i][1];
            result[fromProcess.id] = transitions = succGen.getSuccessors(fromProcess.id);

            transitions.forEach(t => {
                if (!result[t.targetProcess.id] && depth < maxDepth) {
                    queue.push([depth + 1, t.targetProcess]);
                }
            });
        }

        return result;
    }

    export function reachableProcessIterator(initialProcess : ProcessId, succGen : SuccessorGenerator) {
        var visitStack = [initialProcess],
            addedProcs = Object.create(null),
            iterator : any = {};
        
        addedProcs[initialProcess] = true;
        iterator.hasNext = () => visitStack.length > 0;
        iterator.next = () => {
            var result = visitStack.pop();
            var targetProcs = succGen.getSuccessors(result);
            targetProcs.forEach(t => {
                var procId = t.targetProcess.id;
                if (!addedProcs[procId]) {
                    addedProcs[procId] = true;
                    visitStack.push(procId);
                }
            });
            return result;
        };
        return iterator;
    }
}
