package fixture.accessors;

// Exercises the accessor filter for `codePointAt` paired with `indexOf`.
// Four units hold the pair and one deviates, so without the filter this file
// would produce a finding. With the filter it is silent. Any mutant that
// breaks the filter — or drops either name from the list — makes it speak,
// and the golden test fails.
public class AccCodePointAt {

    private Probe4 probe;

    public void holds1() {
        probe.codePointAt();
        probe.indexOf();
    }

    public void holds2() {
        probe.codePointAt();
        probe.indexOf();
    }

    public void holds3() {
        probe.codePointAt();
        probe.indexOf();
    }

    public void holds4() {
        probe.codePointAt();
        probe.indexOf();
    }

    public void deviates() {
        probe.codePointAt();
    }
}
