package fixture.accessors;

// Exercises the accessor filter for `entrySet` paired with `iterator`.
// Four units hold the pair and one deviates, so without the filter this file
// would produce a finding. With the filter it is silent. Any mutant that
// breaks the filter — or drops either name from the list — makes it speak,
// and the golden test fails.
public class AccEntrySet {

    private Probe20 probe;

    public void holds1() {
        probe.entrySet();
        probe.iterator();
    }

    public void holds2() {
        probe.entrySet();
        probe.iterator();
    }

    public void holds3() {
        probe.entrySet();
        probe.iterator();
    }

    public void holds4() {
        probe.entrySet();
        probe.iterator();
    }

    public void deviates() {
        probe.entrySet();
    }
}
