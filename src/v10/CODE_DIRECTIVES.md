# Code Directives
For TS.

## Concrete rules
#### Robustness
- ALWAYS handle potential falsey/nil inputs. Also handle empty strings -- sometimes these are not expected/desired. 
- Try giving an implementation handling edge cases already on your first shot. You need to act like an expert-level software dev, not like a novice who makes such basic mistakes.

#### Clean Code and Scalability
- use a lot of the principles expressed by the SOLID/Clean Code doctrine
- Scalability and extensibility are first-class concern.
- High degree of abstraction is desired. 

#### Meaningful wrapping
- Wrapping (e.g. `Result` objects, `Envelope` messages, etc) to handle things in a structured, predictable, graceful, and extensible way is demanded at least for the most important functionalities of the project.
- catch and wrap errors that other contexts might throw at strategic places
  
### But not pointless wrapper functions
- do not create functions whose ONLY job is wrapping another one

#### No brittle syntax
- where it makes sense check for existence before eagerly trying to handle a value


#### Early fails and guards
- we highly value dedicated type-guard functions (synergize with early fail). 
- use early returns, especially early fails. Especially with guard clauses.

#### Low indentation clear architecture
- strongly prefer a declarative low-indentation style code in the main initializing/starting functions/methods.
- reduce indentation via failure-/guard-based steering and via extracting logic to their own functions.

#### Entry-point-most scripts have the most declarative style
- Related to prev point, the closwe are to the central singleton or the `main`, the more declarative the code should be.

#### Balanced paradigm
- Our architecture is not heavily OOP. We have a more balanced approach between FP-like principles and OOP. stateful things = classes, highly composable non-stateful things = functions
- we do NOT use a Java-like project organization of splitting code into a large number of small files
- inheritance is allowed exactly 1 level deep, with the parent being preferably an abstract class

#### Smart modular functions/classes
- put effort into writing smart, reasonably modular code from the start.
- prefer the parameter style where a function/method takes only one object which contains the parameters, so that we can have a named dict, Python-style. Another variant is just the first param being a non-dict, but the second param being
such an options dict. (what I said doesn't apply to functions that e.g. multiply two numbers -- if an options dict is needed, you could put it into the third param.)

### No deeply nested objects
pathological cases like `completion.value.transaction.value.micTake ` -- there is almost never a reason to access something nested more than 3 members deep. 


##### Heuristic for when to use a class and when to use a function:
- Does it track state? Does it refer to `this` inside the body, or is it perceivable that it might do? Would be a cleaner structure if it kept state and referred to a `this` state instead of a thick object being passed as a param? **Then always use a class.**

If that is not the case: do you need to create an ad hoc object that matches some interface? Consider making this a true class instead. Especially what naturally seems class-like, even if the current impl doesn't refer to `this.` inside its body. E.g. a `Scheduler`. 
 e.g. it only  transforms, **then define use a function.**

- A function that transforms may internally make use of a class that it generates just for a purpose, then modifies that class to get, for example, a transducer, then uses that and then outputs the final result. In fact, this is often the cleanest architecture.

### How to write classes
- you MUST add a comment block between 3 and 15 lines long explaining why this facility is a class. [as opposed to separate functions]
- every single method MUST contain a reference to `this.`. If this would be superfluous, it tells you that this SHOULD NOT BE A METHOD OF THIS CLASS, BUT RATHER A SEPARATE FUNCTION IMPORTED FROM A CENTRAL LOCATION
- No god-classes: if a class has 10 or more non-primitive private fields, even if it's some central orchestrator, it's too big. Delegate and compose more.

#### Most object creation = class
Non-throwaway objects get mainly defined via classes
- If for e.g. a GUI we have some "Table" or "Matrix" etc. entity, then it probably has corresponding classes (can be one or several that compose it). We do NOT want things like "buildMatrix" in which we gradually populate an obj.
- do *not* use helpers inside classes. EVERY method ALWAYS includes a reference to `this.` (the current class instance). 
- ALWAYS extract methods/functions that do not refer to `this.` to an EXTERNAL utility function.
- single-responsibility principle for classes. Classes DON'T need to define e.g. filesaving APIs, string sanitization etc.
- do not use methods on classes for utility functionality that could also be an imported utils function (e.g. no `private ensureDirectory` etc.)



#### No magic values; configurable value decoupling
- make a difference between configurable values, which you should put into a configuration object at the beginning of the module. Most things should be configurable in a way that makes sense for the module. For example, if the module is mainly about a class, it is configured via setting class configuration, or perhaps it is passable as parameter objects to functions. 
- This configuration object can also be understood as the default configs used in the module.
- For everything else where it doesn't make sense to track them as config, still concentrate them as enums rather than as magic strings/numbers. Refrain from using most magic strings and values, and instead put them into enums at a convenient spot in the file. 
- do not use magic strings or magic numbers. Create enums, which are saved in some logical location.

#### No boolean soup, No smushed code
- no oneliner `if(...<four or more different inline statements || or &&>)` statements. Self-document the code with well-named `consts` that are then handled in the `if` statement.
- do not write in "Pathological one-liner style".
- do not use "Overeager ternary-style": Do not press many statements into one ternary. Split it up. Use the opportunity to check for falseys if that is relevant.
Pathological one-liner/Overeager ternary-style example (undesired):
```ts
abc = query && typeof query === 'string' ? query.replace(/[^a-zA-Z0-9\s]/g,'').trim() : '';`
```
Example of better style (desired): 
```ts
if (query && typeof query){ 
    const abc = query.replace ...
```

- vertical space is not a premium; but number of logical ops on a line is a premium. 

#### No half-assed error handling
Bad example: ` throw new TypeError('AgentExecutionService requires complete dependencies.')`
What does that mean? It should say what the full dependencies are or at least show back the insufficient string. Rule of thumb: bare strings NEVER suffice for error messages.

- dont throw bare `throw new AbcError`. instead, `throw createAbcError` 
- 

For code that is about to be passed into an API that EXPECTS a very specific string shape or object shape or it throws or fails silently (e.g. the `url` given to an `img` element):
- always be pessimistic. Validate before passing if it's a CHEAP OPERATION (like string validation)

- do optimistic consumption/passing if the thing to validate is (potentially) expensive. E.g. getting a fresh token. If we don't know about the freshness, then we can be optimistic. 


#### Adapters
- whenever we use a 3rd party dependency, except in some circumstances (like React), wrap it in a more domain/project specific function and export it from a `utils` like dir. This so we can later swap the implementation if we want.
-  
#### Other
- classes can extend an abstract base class exactly once; the latter can not extend anything


#### Typing
- NEVER cast to `any` or `as any` and in general be extremely frugal with casting.
- eagerly make schema/defaults/other such protocol objects `as const`. 
- omit `readonly`, dont call `Object.freeze` unless absolutely necessary
- omit `public` keyword.
- if an interface accepts a union of strings like `'green' | 'red' | ..`, create that field with `LiteralUnion`: 
```ts
export type LiteralUnion<
	LiteralType,
	BaseType extends Primitive,
> = LiteralType | (BaseType & Record<never, never>);
```

- try to bundle domain types and interfaces you will create inside meaningfully named `namespace`s.
Worse example: `export interface XConfig {...}`
Good example: 
```ts
// export style
export namespace X {
    export interface Config {...}
}

// declare style
declare namespace X {
    interface Config {...}
}
```


#### Interfaces communicate intent
an actual class (incl a `Host` singleton) may implement one or more interfaces;
consumers/callers can use these to reason about what capabilities the API supports


### Should use generics for typings
- somewhat, but not excessively, use generics for interfaces/types. Do not make a million throwaway interfaces just so you can avoid generics usage.

### Must use generics for runtime entities
You must use generics preferring extending classes -- unless you have more than 3 unique-to-that-domain methods or fields, then extending is allowed.

Example: 
More undesired: `class XyzRegistry { ... }; const xyzRegistry = new XyzRegistry()`.

More desired: `const xyzRegistry = new Registry<Xyz>()`

Generics are also encouraged for use in interfaces (don't overdo it).

!!!: agent will do frivolous near-empty,  no-unique-logic containing wrapper classes otherwise.


- use one-true-brace style. `if` statements always with braces.
 

### Commenting
- comments are *always*: 1. between senior software engineers. No low-information statements., 2. for organization-internal reference only. There are no third-party users -- I (the developer) is the only enduser of the app.
- generally, comments should describe not what the next piece of code does, but its ROLE IN THE OVERARCHING PROJECT/MODULE. Also: gotchas or non-obvious things -- add such things to comments.


### For regular files
#### Post-imports, pre-code comment block
Include this in most files. Following schema:
```ts
/**
* 
* <
describe the purpose of the facilities inside this file in a code agnostic way.
describe the purpose, not how the code works.
Do not refer to concrete imported facilities -- it will rapidly become outdated because we CONTINUOSLY REDESIGN.
Typings from the namespaces or *.types.ts files are MORE robust, but still not totally robust.
length: 2 to 25 lines -- more than 10 mostly only if a JSON/example/shape is included into the comment block
>
*/
```

##### elsewhere in the same file
- the same principle holds. Do not explain the following lines, instead explain the use case of the commented block. Not more than 3 lines each
- some methods should get comments
- after 200 lines, if there is only the introductory comment block, it's too little comments in the file

### For typings, or for first-class constant config objects
- you are allowed to comment considerably more, and more in-depth. Why? Because it's assumed it's NOT referring to constantly being redesigned code. So you may use that.

### In the central Host or a main.ts
Another exception. You may comment a bit more.





## No excess logic into stores-of-values
if a Collection (XyzMap, Registry<XYZ>, AbcStore, etc.) gets a value, it is NOT normalized inside the Collection EXCEPT for the most error prone things. 
Normalize yes: null or missing fields.
Normalize no: e.g. `.logLevel` of the `logger` as `"info"`.

!!!: Agents will turn these into god-classes with no rhyme or reason. These stores/collections should only care about managing collections/lists/maps/etc..

Where should such normalization happen? In whatever is the calling context that cares about the Collection



### type guards
create `isX` type guards
explicitly disallowed: checking with `instanceof` directly like  ` if (!(child instanceof HTMLElement)) return;`
ALWAYS call the utility func


### Fixtures/mocks/test data
The concept and strings of `fixture/mock/seed/test-data/demo` can never appear in `src/`. We seed the test data at the very end inside the test files or the demo app.


## Patterns
- a Gateway is NEVER a UI exposed fact. It's always internal machinery and ONLY for modelling how there is an indirection between server access and other high level code (mostly not needed).

## Naming
This section is important, because naming also has repercussions on code organization.

### General
- Registry = anything that is conceptually more durable than a session. E.g. preferences (does not autoimply "reads from localStorage")
- Store = anything that is just in-memory
- Repository = exactly how Uncle Bob/Clean Code proposes the Repository pattern. 
- never introduce/insert methods that are not clear verbs. Instead of `x.settled()` use `x.isSettled()`. 
- CommandRegistry(lookup)
- CommandExecutor (run with context) (No other uses of "Executor" anywhere else in the app)
- Service
  
### Config vs Preferences naming
- use the name `Config` only for non-user facing non-editable stuff
- use `Preferences` for the stuff users might want to define (not NECESSARILY already implemented)
- if I refer to "config" I ALWAYS mean configuration that a user of the frontend/GUI CANNOT  change. E.g. `const defaultConfigs = {`  that purely live inside TS code and are editable as hard code.
- if I refer to "preferences"/"prefs", it ALWAYS means things that are exposed to users and changeable by users.
- "settings" can refer to any kind of such configuration/preferences.



- Never name frontend components just `xyzSection`. The `<section>` element communicates that. Use a pertinent descriptor, like Box, Strip, Panel, etc.

- No XyzRepository vs XyzStore confusion: ALWAYS use different nouns for both. Xyz in both is an error.

### forbidden for objects/classes/namespaces
-----
`AppX`, `appX`
!!!: you will randomly add that prefix  to some domains/functionalities, and not others. So don't use it at all.

`Relation` / `Entity` -- too abstract

### banned for directory names directly underneath ./src 
- (events)
- (themes|styles)      (>> colocate closer to the .tsx root)
- (app|dashboard)      (>> no meaningless catch-all terms)


### forbidden naming for functions/methods
- using just a noun, without any verbs, as a function or method name (only outside React components).
- the following: `emitX`, `callX`,
 `publishX` if as an event dispatcher,
!!!: no need for a high level api. Just emit directly on the event bus.

-----
`projectX`
!!!: unclear what it means. Could refer to GUI or something else. Also not specific enough. For GUI suggested e.g. `renderX`
-----

### Suggestions (rather than rules)
verbs:
`delete`: only within the context of the filesystem (either actual or virtual); for other uses rather consider: 
- `remove`
- `dispose`
- `destroy`
- `kill`
Clarifications:
`close`: shouldn't  dispose, rather ONLY sets to non-visible/non-active and other such consideration. This is NOT the same as `hiding`. `close` > semantically ejected-but-restorable, `hide` semantically still live, but not physically visible.


### Field names
`scope` = be more clear.

### Other naming improvements
- if there is a fdomain and it uses a Registry or Service, dont just name it
<fdomain>Registry or <fdomain>Service. Be more informative. (E.g. if we recognize "translation" as some fdomain, then "TranslationService" might be a) confusing and b) not precise enough. Maybe there is some more ideal solution, like "TranslatorService).




# Concepts

## Organization via Code generally beats forcing a DSL
- example rule-doing-action-triggers-when-non-simplistic-criteria-a-to-z-are-met is nearly impossible to write as DSL.


```
The server cannot currently receive normal transcription payloads.
[http-server.ts (line 28)](D:/personal/projects/_SERVERS_/Credentials-Provider/src/http-server.ts:28) limits request bodies to 4 MiB. The application allows audio near 25 MB, matching the documented transcription limit. The server therefore needs a multipart parser and approximately 32 MiB of allowance. OpenAI documents /v1/audio/transcriptions as multipart and permits files up to 25 MB. OpenAI speech-to-text documentation
The local CORS configuration is already correct.
```

What in the world is actually going on?
What bizarro upside down logic anti-pattern is that?
You are gonna send the audio media containing request to the server backend? for ... what? the server only servers tiny jsons with credentials.

this speech diction app is supposed to be frontend only (beside the cred server)



Replace the naive concatenation in transcription and correction.
Rename configured values from misleading versioned “paths” to resources:
transcriptionResource: 'audio/transcriptions'
responsesResource: 'responses'

NOOOOOOOOOOOOOOOOOOOOOOOOOOOOO.
WE DO NOT CONCAT TOGETHER PROPS AND MAKE EVERYTHING EVEN WORSE.


in less than 50 lines state:
why does backend send one part of the endpoint? why does it care? its not the job of the credentials provider to inform about what the endpoint is. maybe they change it tomorrow to clown.com. what does my API key or my username care?

in the frontend, wherever the rest of the model-provider/vendor is defined, theres the info about the endpoints.
we show FULL. we EXPLAIN FULL
https://api.openai.com/v1/audio/transcriptions does what? it does abc...


if we still combine somewhere, we go from `https://api.openai.com` as root. the path is then `v1/audio/transcriptions`. but `audio/transcriptions` is also handled. because there is ALWAYS a normalizeUrl step

we pass this url "https://api.openai.com/v1/audio/transcriptions"
for this capability abc the normal endpoint should match "https://api.openai.com/v1/audio/transcriptions"
> success



normalizeUrl
    if hasSeamFaults
     fixSeamFaults

hasSeamFaults assumes that it never happens that someone has a url like `example.com/aaa/aaa/bbb`. i have never seen that. it's a fault.

NEW MESSSAGE/EVENT TYPE: Fault. these are not failures, but still defects that got handled. usually a WARNING. we log that this fault occured and how it got handled.



IN A DIFFERENT PLACE MAYBE WE HAVE

we pass this url "https://example.com/v1/search?some=jidjf&uuu=sdfjfds"
for this capability xyz the normal endpoint should match "https://example.com/v1/search"
> success

match is actually regex.


matches isnt shown in the spec announcing endpoint capabilities etc. its created internally and can be dev inspected on demand. and the matches is dynamically compiled from the url string, not defined separately. ok, but now add your own spins thoughts improvements. think along collab


--------------



# CORS
Whenever the topic has something to do with requesting from within a browser page/locally hosted page, then you MUST address he issue of CORS and handle it. Do not wait for me to bring up such an error.

## Native APIs 
- for any and all date/time manipulation use the new Temporal API. No polyfill needed.
- consider the "using" JS API, as in `using abc = someAbcHandler` for rapidly disposable values.
- Node: use AsyncLocalStorage
- node:diagnostics_channel



----
directive_id: code_directives
confirmation_token: 🟡
description: TS coding style — robustness/guards, the class-vs-function heuristic, wrapping/Result, no magic values, no boolean-soup, typing rules (LiteralUnion, namespaces, no Record/any), generics, comment blocks, and the allowed-library list.
keywords: TypeScript, code style, SOLID, guards, type guards, classes, functions, generics, namespaces, typing, enums, error handling, wrapping, Result, comments, libraries, Temporal
prioritize_when: writing or editing any TS/JS code, or reviewing code for style. Load before the first line of implementation.
----