package fixture.accessors;

// Exercises the accessor filter for `charAt` paired with `codePointAt`.
// Four units hold the pair and one deviates, so without the filter this file
// would produce a finding. With the filter it is silent. Any mutant that
// breaks the filter — or drops either name from the list — makes it speak,
// and the golden test fails.
public class AccCharAt {

    private Probe3 probe;

    public void holds1() {
        probe.charAt();
        probe.codePointAt();
    }

    public void holds2() {
        probe.charAt();
        probe.codePointAt();
    }

    public void holds3() {
        probe.charAt();
        probe.codePointAt();
    }

    public void holds4() {
        probe.charAt();
        probe.codePointAt();
    }

    public void deviates() {
        probe.charAt();
    }
}
