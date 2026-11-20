---
paths:
  - "**/*.cls"
  - "**/*.trigger"
  - "**/*-meta.xml"
  - "force-app/**"
  - "unpackaged/**"
---

# Salesforce / Apex Coding Standards

You are the owner and long-term maintainer of this codebase, and its design is up to you.

Where a repo's own rules say something different, follow the repo.

## Verification

Many of these principles are enforced by a custom PMD ruleset via the `sf-code-analyzer` skill. **After creating or modifying any `.cls`, `.trigger`, or `*-meta.xml` file, run the `sf-code-analyzer` skill on the changed files before considering the task done.**

## Core Principles

### One Return Per Method

Methods have exactly one `return` statement at the end. Use the `result` variable pattern.

(Checked by custom PMD rule: `OnlyOneReturnPerMethod` and `DeclareWhatYouReturnFirstAndCallItResult`)

```java
private List<Account> findAccounts(String name) {
    List<Account> result = new List<Account>();

    for(Account acc : accounts) {
        if(acc.Name.contains(name)) {
            result.add(acc);
        }
    }

    return result;
}
```

### No Forbidden Suffixes

Never use: `Service`, `Handler`, `Manager`, `Helper`, `Util`, `Wrapper`

These names hide intent. Use domain names that reveal what the class represents.

(Checked by custom PMD rule: `ClassNamesBecomeSelfFulfillingProphecies`)

### Comments: When Forbidden, When Required

No formal JavaDoc/ApexDoc `/** */` comments. If code needs explanation, the code is unclear. Write clearer code. Write better tests.

However, there are exactly two exceptions where `// Note:` comments ARE required:

1. **Strange code that must be that way** — Code that violates normal conventions but is necessary. Explain why it's an exception.
2. **PMD suppressions** — Every `@SuppressWarnings` must have a `// Note:` comment explaining why the rule is being skipped.

(Checked by custom PMD rules: `CommentsOftenExcuseForBadCodeAndTests` and `CheckIfProperFalsePositive`)

Examples:

```java
// Note: without sharing required to access org-wide data
public without sharing class ReportGenerator {
    ...
}

// Note: Input is required=true in schema — Agentforce won't call without it
@SuppressWarnings('PMD.MissingNullCheckOnSoqlVariable')
private static List<Account> fetchAccounts() { ... }
```

### Tests Don't Start With "test"

Never prefix a test method with `test`. It adds no information — the `@IsTest` annotation and `_Test` class suffix already say it's a test.

(Checked by custom PMD rule: `TestsShouldNotStartWithTest`)

### Test Method Names: Match the Scope of What's Being Verified

The right name depends on how many tests the method under test has:

**One vanilla test per method → name it after the method.**
A single happy-path test for `execute()` should just be called `execute()`. Class + method reads `SearchDataLibrary_Test.execute` — which says exactly what it is. No need to invent descriptive prose for a test that covers one obvious behavior.

**Multiple tests per method → name by scenario, as short as possible.**
Once you need to distinguish cases, use the shortest name that differentiates them. Two or three words is usually enough.

- Good: `execute()`, `executeWithChunks()`, `executeWithoutChunks()`
- Good: `retrieves()`, `retrievesEmptyOnBadDmo()`
- Bad: `executeFallsBackToChunksOnlyWhenFullDocumentPromptFails()` — a prose essay. The test body is mostly mocking; the name shouldn't oversell it.
- Bad: `testExecute1()`, `testExecute2()` — numbered, meaningless, and starts with `test`.

**When a long descriptive name *is* warranted:**
Integration-style tests with real setup, exercising a non-obvious behavior worth calling out, can use sentence-style names (`returnsOverdueTasksFirst()`). The rule of thumb: the name's length should roughly match how much real behavior the test exercises. Heavy mocks → short name. Real data + real assertions → longer name is fine.

### Use Salesforce Standards, Don't Reinvent

Don't invent workarounds for problems Salesforce already solved. Use the built-in features:



- Named Credentials (not Custom Settings for authentication)
- Platform Events (not custom polling mechanisms)
- Salesforce-native configuration over custom metadata

### Test Quality Rules

These rules serve readability. A few meaningful tests beat many pseudo-tests. If following a rule makes the tests longer or harder to read, don't.

1. **Test behaviors, not methods.** Write one test for each result a caller can tell apart: the happy path, plus each input that changes the result (empty, at a limit, refused, failing). If two inputs give the same result, write one test.
2. **One behavior per test, with as many assertions as it needs.** A happy path may check three things. For a returned list, check that it isn't empty, then check the value that matters. A test is too big when its assertions describe different behaviors. Don't pack several values into one list to compare them in a single assertion.
3. **Every test must be able to fail, and its name says what it checks.** If the behavior it names broke, the test must go red. A failure test must fail only for the reason it tests, not because its setup is also invalid.
4. **Assert what the code produced, as literal values.** Never assert a mock's return value, the test's own setup, a constant, or a value computed by the code under test. Never "this or that".
5. **For errors, assert the specific message or type.** Catching any exception and asserting that it isn't null is not a test.
6. **Test only our behavior, and only through public methods.** Don't test Salesforce itself (plain DML, formula fields, JSON). Don't test trivial getters or plumbing. Don't use `@TestVisible` just to reach coverage.
7. **Test each class in its own `_Test`.** No tests of other classes on the side, and no duplicates. Setup that several tests or test classes repeat goes into a builder or helper.
8. **Line coverage is the floor, not the goal.** If lines are still uncovered after every behavior is tested, question the code before writing a test for those lines.
9. **Deleting a useless test is a good change.**

Good (rules 1, 2, 4 — one behavior, a few assertions, literal values; minimal examples):

```java
@IsTest
private static void returnsOverdueTasksFirst() {

    // Setup
    Id contactId = (Id) new Contact_t().persist().Id;
    new Task_t().whoId(contactId).subject('Late').dueDate(Date.today().addDays(-3)).persist();

    // Exercise
    List<Task> actual = new OpenTasks(contactId).list();

    // Verify
    Assert.isFalse(actual.isEmpty());
    Assert.areEqual('Late', actual[0].Subject);
}
```

```java
@IsTest
private static void refusesBlankQuestion() {

    // Setup
    AskAction.Input input = new AskAction.Input();

    // Exercise
    String message;
    try { AskAction.execute(new List<AskAction.Input>{ input }); }
    catch(AskAction.AskException e) { message = e.getMessage(); }

    // Verify
    Assert.areEqual('Question is required', message);
}
```

Bad (rule 4, "this or that": the assertion accepts either key, so it passes whichever one the code produced):

```java
Assert.areEqual('Marcus Bell', first.containsKey('resource') ? first.get('resource') : first.get('name'));
```

### Test Isolation — Every Test Stands Alone

Each test method must be completely isolated. No shared state, no global test variables, no `@TestSetup`.

Repeated setup goes into a builder or helper (test rule 7). Setup code belongs in the test method itself, called via a helper method:

```java
@IsTest
private class MyClass_Test {

    @IsTest
    private static void someTestBehavior() {

        // Setup
        setup();

        // Exercise
        ...

        // Verify
        ...
    }

    // HELPER

    private static void setup() {
        ...
    }
}
```

## Project Structure

```
force-app/
└── main/default/
    └── classes/                       # ALL your classes go here (flat structure)
```

Keep all classes together. Tests next to their subjects. No sub-packages.

## Coding Patterns

### Class Structure

Organize with ALL-CAPS section comments. Double blank lines between methods:

```java
public with sharing class ClassName {

    private static final String CONSTANT = 'value';

    private String field;


    // CONSTRUCTOR

    public ClassName() {
        // initialization
    }


    // PUBLIC

    public String process() {
        String result = doWork();

        return result;
    }


    // PRIVATE

    private String doWork() {
        String result = 'processed';

        return result;
    }


    // INNER

    public class InnerClass {
        public String value;
    }
}
```

### Test Structure

Three section comments only: `// Setup`, `// Exercise`, `// Verify`. No other comments in tests. Blank line before each section. Double blank lines between test methods:

```java
@IsTest
private class ClassName_Test {


    @IsTest
    private static void returnsExpectedValue() {

        // Setup
        Account acc = (Account) new Account_t().name('Acme').persist();


        // Exercise
        String actual = MyClass.process(acc);


        // Verify
        Assert.areEqual('expected', actual);
    }


    @IsTest
    private static void throwsExceptionForInvalidInput() {

        // Setup
        ...


        // Exercise
        ...


        // Verify
        ...
    }


    // HELPER

    private static Input createInput() {
        Input result = new Input();
        result.value = 'test';

        return result;
    }
}
```

### No Assertion Messages

Assertions have no message parameter. This is a red flag: if you need a message to explain what an assertion does, your test method is doing too much.

The test method name should fully describe what is being verified. If you're writing assertion messages, the test is checking more than one behavior; split it (rule 2 of the test rules):

- Bad: `testUserCreation()` with `Assert.areEqual(user.status, 'active', 'User should have active status')`
  - Problem: One method testing several behaviors (creation, status, ...)
  - Needs a message because the name doesn't say what's being verified

- Good: `createsUserWithActiveStatus()` with `Assert.areEqual('active', user.status)`
  - The method name is explicit. The assertion is obvious. No message needed.

### Method Chaining Alignment

Indent to align visually:

```java
String response = new PromptTemplate('ExtractTasks')
                            .call(new Map<String, Object>{
                                'Input:notes' => notes
                            });
```

### SOQL Formatting

A query that fits on one line stays on one line:

```java
Id typeId = [SELECT Id FROM CustomNotificationType WHERE DeveloperName = 'GenericNotification'].Id;
```

When it gets too long, keep the field list together and break before `FROM` or `WHERE`. Align the following lines under `SELECT`. Never put each field on its own line.

```java
ContentVersion file = [SELECT VersionData, PathOnClient, FileExtension, ContentSize FROM ContentVersion
                       WHERE ContentDocumentId = :analysis.DocumentId__c WITH USER_MODE];

List<CompletionApi__mdt> result = [SELECT MasterLabel, Label, QualifiedApiName, DeveloperName, ApiKey__c, Settings__c
                                   FROM CompletionApi__mdt WHERE QualifiedApiName = :apiName WITH SYSTEM_MODE];
```

### Invocable Actions

```java
// Note: Agentforce requires global
@SuppressWarnings('PMD.AvoidGlobalModifier')
global with sharing class VerbNounAction {

    @InvocableMethod(label='Action Label' description='What it does')
    global static List<Output> execute(List<Input> inputs) {
        Output output = new Output();
        // ... implementation ...

        return new List<Output>{ output };
    }


    // INNER

    global class Input {
        @InvocableVariable(label='Field Label' description='Description' required=true)
        global String fieldName;

        // Note: Empty constructor required for Invocable Methods deserialization
        @SuppressWarnings('PMD.EmptyStatementBlock')
        global Input() {}
    }


    global class Output {
        @InvocableVariable(label='Result' description='Description')
        global String result;
    }
}
```

## Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Custom Objects | PascalCase, no underscores | `ContactSkill__c` |
| Custom Fields | PascalCase, no underscores | `SkillLevel__c` |
| Triggers | Plural object name | `Contacts.trigger` |
| Test Classes | `_Test` suffix | `Pricing_Test.cls` |
| Controllers | `Ctrl` suffix | `AccountListCtrl` |
| Domain Builders (standard) | `_t` suffix | `Account_t`, `User_t` |
| Domain Builders (custom) | No suffix | `Project`, `Task` |

### Methods

No `get` prefix:

- Bad: `getAge()`, `getName()`
- Good: `age()`, `name()`
